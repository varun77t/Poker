import {
  DEFAULT_ROOM_SETTINGS,
  type ActionType,
  type Card,
  type GameView,
  type PlayerId,
  type RoomSettings,
  type TableSnapshot,
} from '@poker/shared';
import { shuffledDeck } from '../../src/engine';
import { silentLogger, type Logger } from '../../src/logger';
import { DEFAULT_TIMINGS } from '../../src/policies';
import { toSnapshot, type Room } from '../../src/rooms/room';
import { RoomManager } from '../../src/rooms/roomManager';
import { stackDeck } from '../engine/helpers';
import { FakeClock } from './fakeClock';
import { controlledRandomInt } from './random';

export const TIMINGS = DEFAULT_TIMINGS;
export const TURN_MS = DEFAULT_ROOM_SETTINGS.turnSeconds * 1000;

/** Cards for one hand, by seat; anything unspecified is filler (see stackDeck). */
export interface HandCards {
  hole?: Record<number, [Card, Card]>;
  board?: Card[];
}

export interface TableHarnessOptions {
  settings?: Partial<RoomSettings>;
  /** Stacked decks by hand id; other hands get a seeded shuffle. */
  hands?: Record<number, HandCards>;
  seed?: number;
  /** Called after every room change, after the version bump (for invariant checks). */
  onChange?: (room: Room) => void;
}

/**
 * A RoomManager with a fake clock, seeded randomness and optional stacked decks, plus shortcuts for
 * driving a table from tests. Players are seated in the order given (seat 0, 1, ...); the first is host.
 */
export function createTableHarness(playerIds: string[], options: TableHarnessOptions = {}) {
  const clock = new FakeClock();
  const randomInt = controlledRandomInt(options.seed ?? 1);
  const deckRandom = controlledRandomInt((options.seed ?? 1) + 1000);
  const changes: Room[] = [];
  const deleted: string[] = [];
  /** Errors the server logged (e.g. a failing timer callback). Tests expect none. */
  const errors: unknown[] = [];
  const logger: Logger = { ...silentLogger, error: (message, meta) => errors.push(meta ?? message), fatal: (m, meta) => errors.push(meta ?? m) };
  const rooms = new RoomManager({
    clock,
    timings: TIMINGS,
    randomInt,
    newDeck: ({ handId, buttonSeat, seats }) => {
      const cards = options.hands?.[handId];
      return cards ? stackDeck({ seats, buttonSeat, ...cards }) : shuffledDeck(deckRandom);
    },
    logger,
    onRoomChanged: (room) => {
      changes.push(room);
      options.onChange?.(room);
    },
    onRoomDeleted: (code) => deleted.push(code),
  });

  const ref = (id: string) => ({ playerId: id, displayName: id });
  const [host, ...others] = playerIds;
  const room = rooms.create(ref(host as string), { ...DEFAULT_ROOM_SETTINGS, ...options.settings });
  for (const id of others) rooms.join(ref(id), room.code);

  const snapshot = (id: PlayerId): TableSnapshot => toSnapshot(room, id, clock.now());
  const game = (id: PlayerId = host as string): GameView => {
    const view = room.table?.gameView(id);
    if (!view) throw new Error('No game view');
    return view;
  };
  const playerAt = (seat: number | null): PlayerId => {
    const id = seat === null ? undefined : room.seats[seat]?.playerId;
    if (!id) throw new Error(`Nobody at seat ${seat}`);
    return id;
  };

  return {
    clock,
    rooms,
    room,
    changes,
    deleted,
    errors,
    ref,
    snapshot,
    game,
    playerAt,
    /** Starts the game with the first button on the lowest occupied seat. */
    start(buttonIndex = 0) {
      randomInt.force(buttonIndex);
      rooms.start(host as string);
    },
    /** The player whose turn it is. */
    toAct: (): PlayerId => playerAt(game().toActSeat),
    /** Sends an action based on the current handId/seq, like a well-behaved client. */
    act(id: PlayerId, type: ActionType, amount?: number) {
      const { handId, seq } = game(id);
      rooms.act(id, { handId, seq, type, ...(amount === undefined ? {} : { amount }) });
    },
    seatStacks: () => room.seats.map((s) => s?.stack ?? null),
    join: (id: string) => rooms.join(ref(id), room.code),
  };
}

export type TableHarness = ReturnType<typeof createTableHarness>;
