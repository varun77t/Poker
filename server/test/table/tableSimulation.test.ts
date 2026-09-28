import { ACTION_TYPES, DEFAULT_ROOM_SETTINGS, type ActionIntent, type LegalActions, type PlayerId } from '@poker/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HandState } from '../../src/engine';
import { DomainError } from '../../src/errors';
import { members, toSnapshot, type Room } from '../../src/rooms/room';
import { createTableHarness, type TableHarness } from '../helpers/table';

/**
 * Random play at the room level: actions (legal and junk), timeouts, pauses, joins, leaves,
 * disconnects and restarts, with invariants checked after every room change:
 * - chips only enter with a new seat (starting stack) and only leave with a departing seat, never mid-hand;
 * - hands deal exactly the members with chips, and pay out to the seats;
 * - the seat/room index and the host stay consistent; leaving seats only exist for the current hand;
 * - the table is never stuck: it always has a timer pending or is legitimately waiting for players;
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
  inLiveHand: boolean;
}

/** Chips each seat accounts for: stack + chips put in this hand for dealt-in players of a live hand. */
function seatRecords(room: Room): Map<number, SeatRecord> {
  const hand = handOf(room);
  const records = new Map<number, SeatRecord>();
  for (const seat of room.seats) {
    if (!seat) continue;
    const p = live(hand) ? hand.players.find((x) => x.playerId === seat.playerId && room.seats[x.seat] === seat) : undefined;
    records.set(seat.joinSeq, { playerId: seat.playerId, chips: p ? p.stack + p.contributed : seat.stack, inLiveHand: !!p });
  }
  return records;
}

const total = (records: Map<number, SeatRecord>) => [...records.values()].reduce((acc, r) => acc + r.chips, 0);

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

    // Chip accounting across the change.
    const records = seatRecords(room);
    const emptied = records.size === 0;
    let expected = total(lastRecords);
    for (const [key, prev] of lastRecords) {
      if (records.has(key)) continue;
      if (prev.inLiveHand && !emptied) fail(`seat of ${prev.playerId} vanished during a live hand`);
      expected -= prev.chips;
    }
    for (const [key] of records) if (!lastRecords.has(key)) expected += STACK;
    if (total(records) !== expected) fail(`chips ${total(records)}, expected ${expected}`);
    lastRecords = records;

    // Index, host and leaving seats.
    const ids = room.seats.flatMap((s) => (s ? [s.playerId] : []));
    if (new Set(ids).size !== ids.length) fail(`someone is seated twice: ${ids.join(',')}`);
    for (const seat of room.seats) {
      if (!seat) continue;
      const indexed = h.rooms.getRoomOf(seat.playerId) === room;
      if (seat.leaving === indexed) fail(`${seat.playerId}: leaving=${seat.leaving} but indexed=${indexed}`);
      if (seat.leaving && !room.table?.isDealtIn(seat.playerId)) fail(`${seat.playerId} is leaving but not in the hand`);
    }
    const memberIds = members(room).map((s) => s.playerId);
    if (memberIds.length > 0 && !memberIds.includes(room.hostId)) fail(`host ${room.hostId} is not a member`);

    // Table state.
    const table = room.table;
    if ((room.status === 'playing') !== (table !== null)) fail(`status ${room.status} with table=${table !== null}`);
    const hand = handOf(room);
    if (table) {
      const view = table.tableView();
      if (table.pendingTimer === null && !view.waitingForPlayers) fail('table is stuck: no timer and not waiting');
      const withChips = members(room).filter((s) => s.stack > 0).length;
      if (view.waitingForPlayers && withChips >= 2) fail(`waiting for players with ${withChips} able to play`);
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
        if (seat?.playerId === p.playerId && seat.stack !== p.stack) fail(`seat ${p.seat} not paid: ${seat.stack} vs ${p.stack}`);
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

function simulate(tape: number[], initialPlayers: number, seed: number): { hands: number; violations: string[]; errors: unknown[] } {
  let t = 0;
  const rnd = (n: number) => ((tape[t++ % tape.length] as number) + t * 7919) % n;
  const ready: { harness?: TableHarness } = {}; // checks start once all first players are seated
  const checker = createChecker(() => ready.harness);
  const harness = createTableHarness(POOL.slice(0, initialPlayers), { seed, onChange: (r) => checker.check(r) });
  const { rooms, room, clock } = harness;
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

  harness.start(rnd(initialPlayers));
  for (let step = 0; step < STEPS && checker.violations.length === 0; step++) {
    const op = rnd(100);
    const memberIds = members(room).map((s) => s.playerId);
    const anyMember = () => memberIds[rnd(memberIds.length)] as PlayerId;
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
        // Junk: a random member, a random action, maybe a stale seq.
        const type = ACTION_TYPES[rnd(ACTION_TYPES.length)] as ActionIntent['type'];
        tolerate(() =>
          rooms.act(anyMember(), { handId: hand.handId, seq: hand.seq - rnd(2), type, ...(rnd(2) ? { amount: rnd(3000) } : {}) }),
        );
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
      if (memberIds.length > 0) rooms.leave(anyMember());
    } else if (op < 95) {
      const id = POOL[rnd(POOL.length)] as PlayerId;
      if (rooms.getRoomOf(id) === undefined || rooms.getRoomOf(id) === room) tolerate(() => harness.join(id));
    } else if (room.status === 'waiting' && memberIds.length >= 2) {
      rooms.start(room.hostId);
    } else {
      runNext();
    }
  }
  rooms.dispose();
  return { hands: room.lastHandId, violations: checker.violations, errors: harness.errors };
}

describe('table simulation', () => {
  it('keeps chips, seats, turns and views consistent under random play', () => {
    let totalHands = 0;
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: 64, maxLength: 64 }),
        fc.integer({ min: 2, max: 5 }),
        fc.nat(),
        (tape, players, seed) => {
          const { hands, violations, errors } = simulate(tape, players, seed);
          totalHands += hands;
          expect(violations).toEqual([]);
          expect(errors).toEqual([]);
        },
      ),
      { numRuns: RUNS },
    );
    // The runs should actually play poker, not just shuffle people around.
    expect(totalHands).toBeGreaterThan(RUNS * 2);
  }, 120_000 + RUNS * 100);
});
