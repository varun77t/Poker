import { ACTION_TYPES, BOT_LEVELS, DEFAULT_ROOM_SETTINGS, type ActionIntent, type LegalActions, type PlayerId } from '@poker/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HandState } from '../../src/engine';
import { DomainError } from '../../src/errors';
import { humans, members, toSnapshot, type Room } from '../../src/rooms/room';
import { createTableHarness, type TableHarness } from '../helpers/table';

/**
 * Random play at the room level: actions (legal and junk), timeouts, pauses, joins, leaves,
 * disconnects, rebuys, bots coming and going (and playing their own turns), the host ending the game
 * and restarting it, with rebuys on or off, and invariants checked after every room change:
 * - chips are a zero-sum ledger: during a game, every seat's and every departed player's chips minus
 *   what they bought in sum to zero; a finished game's net results sum to zero; the lobby holds
 *   exactly one starting stack per seat; no seat vanishes during a live hand;
 * - hands deal exactly the members with chips, and pay out to the seats;
 * - the seat/room index and the host stay consistent; leaving seats only exist for the current hand;
 *   bots are never indexed, never host, and never stay without a person;
 * - the table is never stuck: it always has a timer pending or is legitimately waiting for players
 *   (fewer than two with chips, rebuys on; or bots would play without a person here, R-10.6);
 *   a bot's turn always has its think timer running;
 * - the version goes up by one per change, and no snapshot shows a card its viewer may not see.
 */

const POOL = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
const RUNS = Number(process.env.TABLE_SIMULATION_RUNS ?? 150);
const STEPS = 250;
const STACK = DEFAULT_ROOM_SETTINGS.startingStack;
const CARD_TOKEN = /"[2-9TJQKA][cdhs]"/g;

const handOf = (room: Room): HandState | null => (room.table as unknown as { hand: HandState | null } | null)?.hand ?? null;
const live = (hand: HandState | null): hand is HandState => hand !== null && hand.awaiting !== 'none';

interface SeatRecord {
  playerId: PlayerId;
  chips: number;
  totalBuyIn: number;
  inLiveHand: boolean;
}

/** Chips each seat accounts for: stack + chips put in this hand for dealt-in players of a live hand. */
function seatRecords(room: Room): Map<number, SeatRecord> {
  const hand = handOf(room);
  const records = new Map<number, SeatRecord>();
  for (const seat of room.seats) {
    if (!seat) continue;
    const p = live(hand) ? hand.players.find((x) => x.playerId === seat.playerId && room.seats[x.seat] === seat) : undefined;
    records.set(seat.joinSeq, {
      playerId: seat.playerId,
      chips: p ? p.stack + p.contributed : seat.stack,
      totalBuyIn: seat.totalBuyIn,
      inLiveHand: !!p,
    });
  }
  return records;
}

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

function createChecker(getHarness: () => TableHarness | undefined) {
  const violations: string[] = [];
  let lastVersion = -1;
  let lastRecords = new Map<number, SeatRecord>();
  let lastHandId = 0;
  const fail = (msg: string) => violations.push(msg);

  function check(room: Room): void {
    const h = getHarness();
    if (!h) return; // still seating the first players
    if (lastVersion !== -1 && room.version !== lastVersion + 1) fail(`version jumped ${lastVersion} → ${room.version}`);
    lastVersion = room.version;

    // Chip accounting: a zero-sum ledger of what each player has against what they bought in.
    const records = seatRecords(room);
    const emptied = records.size === 0;
    for (const [key, prev] of lastRecords) {
      if (!records.has(key) && prev.inLiveHand && !emptied) fail(`seat of ${prev.playerId} vanished during a live hand`);
    }
    lastRecords = records;
    if (room.status === 'playing') {
      const seated = sum([...records.values()].map((r) => r.chips - r.totalBuyIn));
      const departed = sum([...room.departed.values()].map((d) => d.stack - d.totalBuyIn));
      if (seated + departed !== 0) fail(`ledger off by ${seated + departed} (seated ${seated}, departed ${departed})`);
      for (const seat of room.seats) {
        if (seat && !seat.played && seat.stack !== seat.totalBuyIn) fail(`${seat.playerId} has chips without playing`);
      }
    } else if (room.status === 'waiting') {
      for (const r of records.values()) if (r.chips !== STACK || r.totalBuyIn !== STACK) fail(`lobby seat of ${r.playerId} is not a fresh stack`);
      if (room.departed.size > 0 || room.finalResults !== null) fail('lobby remembers a game');
    } else {
      const results = room.finalResults;
      if (!results) fail('finished without results');
      else {
        if (sum(results.map((r) => r.net)) !== 0) fail(`final results do not sum to zero: ${JSON.stringify(results)}`);
        const sorted = [...results].sort((a, b) => b.net - a.net);
        if (sorted.some((r, i) => r.net !== results[i]?.net)) fail('final results are not ranked by net');
        for (const r of results) {
          const seat = room.seats.find((x) => x?.playerId === r.playerId);
          if (seat?.played && seat.stack !== r.finalStack) fail(`${r.playerId} finished with ${r.finalStack} but has ${seat.stack}`);
        }
      }
    }

    // Index, host and leaving seats.
    const ids = room.seats.flatMap((s) => (s ? [s.playerId] : []));
    if (new Set(ids).size !== ids.length) fail(`someone is seated twice: ${ids.join(',')}`);
    for (const seat of room.seats) {
      if (!seat) continue;
      const indexed = h.rooms.getRoomOf(seat.playerId) === room;
      if (seat.bot) {
        if (indexed) fail(`bot ${seat.playerId} is in the player index`);
        if (!seat.connected) fail(`bot ${seat.playerId} is disconnected`);
      } else if (seat.leaving === indexed) fail(`${seat.playerId}: leaving=${seat.leaving} but indexed=${indexed}`);
      if (seat.leaving && !room.table?.isDealtIn(seat.playerId)) fail(`${seat.playerId} is leaving but not in the hand`);
    }
    const memberIds = members(room).map((s) => s.playerId);
    if (memberIds.length > 0 && !memberIds.includes(room.hostId)) fail(`host ${room.hostId} is not a member`);
    if (room.seats.find((s) => s?.playerId === room.hostId)?.bot) fail('a bot is host');
    if (humans(room).length === 0 && room.seats.some((s) => s !== null)) fail('bots stayed without a person');

    // Table state.
    const table = room.table;
    if ((room.status === 'playing') !== (table !== null)) fail(`status ${room.status} with table=${table !== null}`);
    const hand = handOf(room);
    if (table) {
      const view = table.tableView();
      if (table.pendingTimer === null && !view.waitingForPlayers) fail('table is stuck: no timer and not waiting');
      const withChips = members(room).filter((s) => s.stack > 0);
      const people = withChips.filter((s) => !s.bot);
      const noOneHere = withChips.some((s) => s.bot) && !people.some((s) => s.connected);
      if (view.waitingForPlayers && withChips.length >= 2 && !noOneHere) fail(`waiting for players with ${withChips.length} able to play`);
      if (view.waitingForPlayers && !room.settings.rebuys && !(noOneHere && people.length > 0)) {
        fail('waiting for players with rebuys off: the game should have ended');
      }
      if (hand?.awaiting === 'action' && room.seats[hand.toActSeat as number]?.bot && table.pendingTimer !== 'bot') {
        fail(`bot to act at seat ${hand.toActSeat} without its think timer (${table.pendingTimer})`);
      }
      if (view.waitingForPlayers && view.endingAfterHand) fail('an ended game is still waiting for players');
      if (view.waitingForPlayers !== (hand === null)) fail('waitingForPlayers must match having no hand');
    }
    if (hand && hand.handId !== lastHandId) {
      lastHandId = hand.handId;
      const dealt = hand.players.map((p) => p.playerId).sort();
      const eligible = members(room)
        .filter((s) => s.stack > 0)
        .map((s) => s.playerId)
        .sort();
      if (dealt.join() !== eligible.join()) fail(`hand ${hand.handId} dealt ${dealt} but eligible were ${eligible}`);
    }
    if (hand?.awaiting === 'none') {
      for (const p of hand.players) {
        const seat = room.seats[p.seat];
        // Paid out, or busted and already rebought during the results pause.
        const rebought = p.stack === 0 && seat?.stack === STACK;
        if (seat?.playerId === p.playerId && seat.stack !== p.stack && !rebought) fail(`seat ${p.seat} not paid: ${seat.stack} vs ${p.stack}`);
      }
    }

    // What each member receives.
    for (const viewer of memberIds) {
      const snap = toSnapshot(room, viewer, h.clock.now());
      if (!hand) {
        if (snap.game !== null) fail('game view without a hand');
        continue;
      }
      const visible = new Set(JSON.stringify(snap).match(CARD_TOKEN)?.map((t) => t.slice(1, 3)));
      for (const card of hand.deck) if (visible.has(card)) fail(`${viewer} sees deck card ${card}`);
      for (const p of hand.players) {
        if (p.playerId === viewer || (hand.allRevealed && p.status !== 'folded')) continue;
        for (const card of p.holeCards) if (visible.has(card)) fail(`${viewer} sees ${p.playerId}'s ${card}`);
      }
    }
  }

  return { check, violations };
}

function randomIntent(legal: LegalActions, rnd: (n: number) => number): ActionIntent {
  const options: ActionIntent[] = [{ type: 'fold' }];
  for (let i = 0; i < 3; i++) {
    if (legal.canCheck) options.push({ type: 'check' });
    if (legal.canCall) options.push({ type: 'call' });
  }
  const amount = [legal.minTo, legal.maxTo, legal.minTo + rnd(legal.maxTo - legal.minTo + 1)][rnd(3)] as number;
  if (legal.canBet) options.push({ type: 'bet', amount });
  if (legal.canRaise) options.push({ type: 'raise', amount });
  if ((legal.canBet || legal.canRaise) && rnd(4) === 0) options.push({ type: 'allIn' });
  return options[rnd(options.length)] as ActionIntent;
}

function simulate(
  tape: number[],
  initialPlayers: number,
  initialBots: number,
  seed: number,
  rebuys: boolean,
): { hands: number; games: number; botActions: number; violations: string[]; errors: unknown[] } {
  let t = 0;
  const rnd = (n: number) => ((tape[t++ % tape.length] as number) + t * 7919) % n;
  const ready: { harness?: TableHarness } = {}; // checks start once all first players are seated
  const checker = createChecker(() => ready.harness);
  const harness = createTableHarness(POOL.slice(0, initialPlayers), { seed, settings: { rebuys }, onChange: (r) => checker.check(r) });
  const { rooms, room, clock } = harness;
  for (let i = 0; i < initialBots; i++) rooms.addBot(room.hostId, BOT_LEVELS[i % 2] as (typeof BOT_LEVELS)[number]);
  ready.harness = harness;
  checker.check(room); // baseline
  checker.violations.length = 0;
  const tolerate = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
    }
  };

  harness.start(rnd(initialPlayers + initialBots));
  let games = 0;
  let botActions = 0;
  for (let step = 0; step < STEPS && checker.violations.length === 0; step++) {
    if (room.status === 'finished' && room.finalResults) games += 1;
    const op = rnd(100);
    // People only: bots have no session, so nobody can act, leave or rebuy as one (tried below as junk).
    const memberIds = humans(room).map((s) => s.playerId);
    const anyMember = () => memberIds[rnd(memberIds.length)] as PlayerId;
    const anySeated = () => room.seats[rnd(room.seats.length)]?.playerId ?? 'nobody';
    const hand = handOf(room);

    // Only run timers while a game is on: an empty room would otherwise hit its deletion TTL at once.
    const runNext = () => void (room.table ? clock.runNext() : clock.advance(rnd(45_000)));

    if (op < 45) {
      if (!live(hand) || hand.awaiting !== 'action') {
        runNext();
        continue;
      }
      const actor = hand.players.find((p) => p.seat === hand.toActSeat) as HandState['players'][number];
      const seat = room.seats[actor.seat];
      if (rnd(8) === 0 && memberIds.length > 0) {
        // Junk: a random member (or a bot's id), a random action, maybe a stale seq.
        const type = ACTION_TYPES[rnd(ACTION_TYPES.length)] as ActionIntent['type'];
        const who = rnd(4) === 0 ? anySeated() : anyMember();
        tolerate(() => rooms.act(who, { handId: hand.handId, seq: hand.seq - rnd(2), type, ...(rnd(2) ? { amount: rnd(3000) } : {}) }));
      } else if (seat?.bot) {
        const seq = hand.seq;
        runNext(); // the bot's think time
        if ((handOf(room)?.seq ?? 0) > seq) botActions += 1;
      } else if (seat && !seat.leaving && seat.connected) {
        const legal = room.table?.gameView(actor.playerId)?.legalActions as LegalActions;
        rooms.act(actor.playerId, { handId: hand.handId, seq: hand.seq, ...randomIntent(legal, rnd) });
      } else {
        runNext();
      }
    } else if (op < 70) {
      if (rnd(2) === 0) runNext();
      else clock.advance(rnd(45_000));
    } else if (op < 78) {
      if (memberIds.length === 0) continue;
      const id = anyMember();
      rooms.setConnected(id, !room.seats.find((s) => s?.playerId === id)?.connected);
    } else if (op < 84) {
      if (rnd(10) === 0) tolerate(() => rooms.leave(anySeated())); // a bot's id is not a player
      else if (memberIds.length > 0) rooms.leave(anyMember());
    } else if (op < 88) {
      const id = POOL[rnd(POOL.length)] as PlayerId;
      if (rooms.getRoomOf(id) === undefined || rooms.getRoomOf(id) === room) tolerate(() => harness.join(id));
    } else if (op < 92) {
      // Bots come and go: usually the host, sometimes someone else (refused); any seat may be named.
      if (memberIds.length === 0) continue;
      const who = rnd(5) === 0 ? anyMember() : room.hostId;
      if (rnd(2) === 0) tolerate(() => rooms.addBot(who, BOT_LEVELS[rnd(2)] as (typeof BOT_LEVELS)[number]));
      else {
        const bots = room.seats.flatMap((s, i) => (s?.bot && !s.leaving ? [i] : []));
        const seatIndex = bots.length > 0 && rnd(4) > 0 ? (bots[rnd(bots.length)] as number) : rnd(room.seats.length);
        tolerate(() => rooms.removeBot(who, seatIndex));
      }
    } else if (op < 96) {
      // Rebuys: usually from a busted member, sometimes from anyone (must be refused cleanly).
      const busted = humans(room).filter((s) => s.stack === 0 && !room.table?.isPlayingHand(s.playerId));
      const id = busted.length > 0 && rnd(3) > 0 ? (busted[rnd(busted.length)]?.playerId as PlayerId) : memberIds.length > 0 ? anyMember() : null;
      if (id) tolerate(() => rooms.rebuy(id));
    } else if (op < 97) {
      if (memberIds.length > 0) tolerate(() => rooms.endGame(rnd(4) === 0 ? anyMember() : room.hostId));
    } else if (room.status !== 'playing' && memberIds.length >= 2) {
      rooms.start(room.hostId);
    } else {
      runNext();
    }
  }
  rooms.dispose();
  return { hands: room.lastHandId, games, botActions, violations: checker.violations, errors: harness.errors };
}

describe('table simulation', () => {
  it('keeps chips, seats, turns and views consistent under random play', () => {
    let totalHands = 0;
    let finishedSteps = 0;
    let totalBotActions = 0;
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: 64, maxLength: 64 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 3 }),
        fc.nat(),
        fc.boolean(),
        (tape, players, bots, seed, rebuys) => {
          const botCount = Math.min(5 - players, Math.max(bots, 2 - players)); // at least two seated to start
          const { hands, games, botActions, violations, errors } = simulate(tape, players, botCount, seed, rebuys);
          totalHands += hands;
          finishedSteps += games;
          totalBotActions += botActions;
          expect(violations).toEqual([]);
          expect(errors).toEqual([]);
        },
      ),
      { numRuns: RUNS },
    );
    // The runs should actually play poker, not just shuffle people around, and reach the finished screen.
    expect(totalHands).toBeGreaterThan(RUNS * 2);
    expect(finishedSteps).toBeGreaterThan(0);
    expect(totalBotActions).toBeGreaterThan(RUNS);
  }, 120_000 + RUNS * 100);
});
