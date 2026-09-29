import { DEFAULT_ROOM_SETTINGS, MAX_SEATS, type FinalResult, type GamePlayerView, type GameView, type SeatView, type TableSnapshot } from '@poker/shared';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { FinishedPage } from './FinishedPage';
import { TablePage } from './TablePage';

/**
 * Development only: the real in-game screens fed with sample snapshots, for design review and
 * screenshots without a running game. Not in production builds.
 * /dev/table?state=turn|flop|showdown|waiting|busted|busted-off|ending|finished|finished-guest|bots|bots-waiting|bots-finished
 * (&edit=1 opens the settings editor)
 */

const NAMES = ['Sam', 'Maya', 'Ravi', 'Jonas', 'Priya'];
const id = (seat: number) => `p${seat}`;

function seat(i: number, over: Partial<SeatView> = {}): SeatView {
  return { seat: i, playerId: id(i), displayName: NAMES[i] as string, stack: 1000, connected: true, waitingForNextHand: false, busted: false, leaving: false, isBot: false, botLevel: null, ...over };
}

/** A bot in seat `i` (§3.7). */
function bot(i: number, name: string, level: 'easy' | 'normal', over: Partial<SeatView> = {}): SeatView {
  return seat(i, { playerId: `bot:${i}`, displayName: name, isBot: true, botLevel: level, ...over });
}

function hp(i: number, over: Partial<GamePlayerView> = {}): GamePlayerView {
  return { seat: i, playerId: id(i), stack: 1000, committed: 0, status: 'active', lastAction: null, holeCards: null, ...over };
}

function snap(seats: (SeatView | null)[], game: GameView | null, table: TableSnapshot['room']['table']): TableSnapshot {
  const all = Array.from({ length: MAX_SEATS }, (_, i) => seats[i] ?? null);
  return {
    version: 1,
    serverTime: Date.now(),
    room: { code: 'RW8W7B', status: 'playing', hostId: id(0), settings: { ...DEFAULT_ROOM_SETTINGS }, youId: id(0), seats: all, table, finalResults: null },
    game,
  };
}

function build(state: string): TableSnapshot {
  const now = Date.now();
  const base: Omit<GameView, 'players'> = {
    handId: 12, seq: 9, street: 'preflop', board: [], pots: [], buttonSeat: 3, sbSeat: 4, bbSeat: 0,
    toActSeat: 0, turnDeadline: now + 18_000, legalActions: null, result: null,
  };

  if (state === 'showdown') {
    const players = [
      hp(0, { stack: 1180, holeCards: ['Ks', 'Kh'], lastAction: { type: 'call', amount: 60, allIn: false } }),
      hp(1, { status: 'folded', stack: 1200, lastAction: { type: 'fold', allIn: false } }),
      hp(2, { status: 'folded', stack: 860 }),
      hp(3, { stack: 1005, holeCards: ['Ac', 'Jd'], lastAction: { type: 'bet', amount: 60, allIn: false } }),
      hp(4, { status: 'folded', stack: 755 }),
    ];
    return snap(
      [seat(0, { stack: 1180 }), seat(1, { stack: 1200 }), seat(2, { stack: 860 }), seat(3, { stack: 1005 }), seat(4, { stack: 755 })],
      {
        ...base, street: 'showdown', board: ['7h', 'Kd', '2c', 'Jc', '7c'], toActSeat: null, turnDeadline: null, players,
        result: {
          wonByFold: false,
          pots: [{ amount: 280, eligibleSeats: [0, 3], winners: [{ seat: 0, playerId: id(0), amount: 280 }] }],
          shown: [
            { seat: 0, playerId: id(0), holeCards: ['Ks', 'Kh'], best5: ['Ks', 'Kh', 'Kd', '7h', '7c'], category: 'fullHouse', label: 'Full house, kings over sevens' },
            { seat: 3, playerId: id(3), holeCards: ['Ac', 'Jd'], best5: ['Jc', 'Jd', '7h', '7c', 'Ac'], category: 'twoPair', label: 'Two pair, jacks and sevens' },
          ],
        },
      },
      { nextHandAt: now + 4000, waitingForPlayers: false, endingAfterHand: false },
    );
  }

  if (state === 'flop') {
    // A side pot, an all-in player, someone away, and someone who left mid-hand.
    const players = [
      hp(0, { stack: 820, committed: 0, holeCards: ['Qh', 'Qd'] }),
      hp(1, { stack: 0, status: 'allIn', lastAction: { type: 'call', amount: 120, allIn: true } }),
      hp(2, { status: 'folded', stack: 850, lastAction: { type: 'fold', allIn: false } }),
      hp(3, { stack: 760, committed: 120, lastAction: { type: 'bet', amount: 120, allIn: false } }),
      hp(4, { stack: 700, status: 'folded' }),
    ];
    return snap(
      [seat(0, { stack: 820 }), seat(1, { stack: 0 }), seat(2, { stack: 850, leaving: true }), seat(3, { stack: 760, connected: false }), seat(4, { stack: 700 })],
      {
        ...base, street: 'flop', board: ['9s', '4h', 'Qc'], seq: 21, players, toActSeat: 0,
        pots: [{ amount: 360, eligibleSeats: [0, 1, 3] }, { amount: 90, eligibleSeats: [0, 3] }],
        legalActions: { canFold: true, canCheck: false, canCall: true, callAmount: 120, canBet: false, canRaise: true, minTo: 240, maxTo: 820 },
      },
      { nextHandAt: null, waitingForPlayers: false, endingAfterHand: false },
    );
  }

  if (state === 'waiting') {
    return snap([seat(0, { stack: 2000 }), seat(1, { stack: 0, busted: true })], null, { nextHandAt: null, waitingForPlayers: true, endingAfterHand: false });
  }

  if (state === 'busted' || state === 'busted-off') {
    // You (seat 0) busted last hand and sit out while the others play; Jonas is deciding.
    const players = [
      hp(1, { stack: 1450, committed: 10 }),
      hp(3, { stack: 1600, committed: 40, lastAction: { type: 'raise', amount: 40, allIn: false } }),
      hp(4, { stack: 1860, committed: 0, lastAction: null }),
    ];
    const s = snap(
      [seat(0, { stack: 0, busted: true }), seat(1, { stack: 1450 }), null, seat(3, { stack: 1600 }), seat(4, { stack: 1860 })],
      { ...base, handId: 31, buttonSeat: 4, sbSeat: 1, bbSeat: 3, toActSeat: 4, players },
      { nextHandAt: null, waitingForPlayers: false, endingAfterHand: false },
    );
    if (state === 'busted-off') s.room.settings = { ...s.room.settings, rebuys: false };
    return s;
  }

  if (state === 'finished' || state === 'finished-guest') {
    const results: FinalResult[] = [
      { playerId: id(3), displayName: 'Jonas', finalStack: 2240, totalBuyIn: 1000, rebuys: 0, net: 1240, botLevel: null },
      { playerId: id(0), displayName: 'Sam', finalStack: 1310, totalBuyIn: 1000, rebuys: 0, net: 310, botLevel: null },
      { playerId: id(4), displayName: 'Priya', finalStack: 1450, totalBuyIn: 2000, rebuys: 1, net: -550, botLevel: null },
      { playerId: id(2), displayName: 'Ravi', finalStack: 0, totalBuyIn: 1000, rebuys: 0, net: -1000, botLevel: null },
    ];
    const s = snap(
      [seat(0, { stack: 1310 }), seat(1, { stack: 1000 }), null, seat(3, { stack: 2240 }), seat(4, { stack: 1450 })],
      null,
      null,
    );
    // Ravi played and left; Maya (seat 1) joined after the game and waits for the next one.
    s.room = { ...s.room, status: 'finished', finalResults: results, youId: state === 'finished' ? id(0) : id(4) };
    return s;
  }

  if (state === 'bots') {
    // You host two bots; Ace Bot is deciding. Two seats are open for more.
    const players = [
      hp(0, { stack: 950, committed: 40, holeCards: ['Jh', 'Td'], lastAction: { type: 'raise', amount: 40, allIn: false } }),
      hp(1, { playerId: 'bot:1', stack: 990, committed: 10 }),
      hp(3, { playerId: 'bot:3', stack: 1070, committed: 0, status: 'folded', lastAction: { type: 'fold', allIn: false } }),
    ];
    return snap(
      [seat(0, { stack: 950 }), bot(1, 'Ace Bot', 'normal', { stack: 990 }), null, bot(3, 'King Bot', 'easy', { stack: 1070 })],
      { ...base, handId: 7, buttonSeat: 0, sbSeat: 1, bbSeat: 3, toActSeat: 1, players },
      { nextHandAt: null, waitingForPlayers: false, endingAfterHand: false },
    );
  }

  if (state === 'bots-waiting') {
    // You busted with rebuys on: the bots have chips but don't play on their own (R-10.6).
    return snap(
      [seat(0, { stack: 0, busted: true }), bot(1, 'Ace Bot', 'normal', { stack: 1840 }), bot(2, 'King Bot', 'normal', { stack: 1160 })],
      null,
      { nextHandAt: null, waitingForPlayers: true, endingAfterHand: false },
    );
  }

  if (state === 'bots-finished') {
    const results: FinalResult[] = [
      { playerId: 'bot:1', displayName: 'Ace Bot', finalStack: 1720, totalBuyIn: 1000, rebuys: 0, net: 720, botLevel: 'normal' },
      { playerId: id(0), displayName: 'Sam', finalStack: 1180, totalBuyIn: 1000, rebuys: 0, net: 180, botLevel: null },
      { playerId: 'bot:2', displayName: 'King Bot', finalStack: 1100, totalBuyIn: 2000, rebuys: 1, net: -900, botLevel: 'easy' },
    ];
    const s = snap([seat(0, { stack: 1180 }), bot(1, 'Ace Bot', 'normal', { stack: 1720 }), bot(2, 'King Bot', 'easy', { stack: 1100 })], null, null);
    s.room = { ...s.room, status: 'finished', finalResults: results };
    return s;
  }

  if (state === 'ending') {
    const players = [
      hp(0, { stack: 900, committed: 40, holeCards: ['9d', '9c'], lastAction: { type: 'call', amount: 40, allIn: false } }),
      hp(1, { stack: 1060, committed: 40, lastAction: { type: 'raise', amount: 40, allIn: false } }),
      hp(3, { status: 'folded', stack: 700, lastAction: { type: 'fold', allIn: false } }),
    ];
    return snap(
      [seat(0, { stack: 900 }), seat(1, { stack: 1060 }), null, seat(3, { stack: 700 })],
      { ...base, handId: 44, buttonSeat: 3, sbSeat: 0, bbSeat: 1, toActSeat: 1, street: 'preflop', players },
      { nextHandAt: null, waitingForPlayers: false, endingAfterHand: true },
    );
  }

  // "turn": your turn preflop, facing a raise.
  const players = [
    hp(0, { stack: 990, committed: 10, holeCards: ['As', 'Kh'] }),
    hp(1, { stack: 960, committed: 40, lastAction: { type: 'call', amount: 40, allIn: false } }),
    hp(2, { status: 'folded', stack: 860, lastAction: { type: 'fold', allIn: false } }),
    hp(3, { stack: 1065, committed: 40, lastAction: { type: 'raise', amount: 40, allIn: false } }),
    hp(4, { stack: 755, committed: 40, lastAction: { type: 'call', amount: 40, allIn: false } }),
  ];
  return snap(
    [seat(0, { stack: 990 }), seat(1, { stack: 960 }), seat(2, { stack: 860 }), seat(3, { stack: 1065 }), seat(4, { stack: 755 })],
    { ...base, players, legalActions: { canFold: true, canCheck: false, canCall: true, callAmount: 30, canBet: false, canRaise: true, minTo: 70, maxTo: 1000 } },
    { nextHandAt: null, waitingForPlayers: false, endingAfterHand: false },
  );
}

export default function DevTable() {
  const [params] = useSearchParams();
  const state = params.get('state') ?? 'turn';
  const snapshot = useMemo(() => build(state), [state]);
  return snapshot.room.status === 'finished' ? (
    <FinishedPage snapshot={snapshot} startEditing={params.get('edit') === '1'} />
  ) : (
    <TablePage snapshot={snapshot} />
  );
}
