import {
  DEFAULT_ROOM_SETTINGS,
  MAX_SEATS,
  type GamePlayerView,
  type GameView,
  type SeatView,
  type TableSnapshot,
} from '@poker/shared';

/** Test builders for snapshots, so tests state only what they are about. */

export const ids = ['ana', 'ben', 'cleo', 'dev', 'eli'];

export function player(seat: number, over: Partial<GamePlayerView> = {}): GamePlayerView {
  return {
    seat,
    playerId: ids[seat] as string,
    stack: 1000,
    committed: 0,
    status: 'active',
    lastAction: null,
    holeCards: null,
    ...over,
  };
}

export function game(over: Partial<GameView> = {}): GameView {
  return {
    handId: 1,
    seq: 5,
    street: 'preflop',
    board: [],
    pots: [],
    buttonSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    toActSeat: null,
    turnDeadline: null,
    players: [player(0), player(1), player(2)],
    legalActions: null,
    result: null,
    ...over,
  };
}

export function seat(index: number, over: Partial<SeatView> = {}): SeatView {
  return {
    seat: index,
    playerId: ids[index] as string,
    displayName: (ids[index] as string).replace(/^./, (c) => c.toUpperCase()),
    stack: 1000,
    connected: true,
    waitingForNextHand: false,
    busted: false,
    leaving: false,
    ...over,
  };
}

/** A playing room with the given seats occupied (others open), seen by `youId`. */
export function snapshot(g: GameView | null, occupied: (SeatView | number)[], youId = 'ana'): TableSnapshot {
  const seats: (SeatView | null)[] = Array.from({ length: MAX_SEATS }, () => null);
  for (const s of occupied) {
    const view = typeof s === 'number' ? seat(s) : s;
    seats[view.seat] = view;
  }
  return {
    version: 1,
    serverTime: 0,
    room: {
      code: 'ABC234',
      status: 'playing',
      hostId: 'ana',
      settings: { ...DEFAULT_ROOM_SETTINGS },
      youId,
      seats,
      table: { nextHandAt: null, waitingForPlayers: false },
      finalResults: null,
    },
    game: g,
  };
}
