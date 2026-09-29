import type { BotLevel, FinalResult, PlayerId, RoomSettings, RoomStatus, RoomView, SeatView, TableSnapshot } from '@poker/shared';
import type { TableController } from '../table/tableController';

/** Server-internal room state. Never sent as-is; clients get `toRoomView`. */
export interface Room {
  code: string;
  hostId: PlayerId;
  status: RoomStatus;
  settings: RoomSettings;
  /** Length MAX_SEATS; null is an open seat. */
  seats: (Seat | null)[];
  /** Incremented on every change; clients drop snapshots older than the one they have. */
  version: number;
  createdAt: number;
  emptySince: number | null;
  /** Runs the hands while the room is `playing`; null otherwise. */
  table: TableController | null;
  /** The last hand id used here. Hand ids never repeat within a room, so stale actions can't match a later hand. */
  lastHandId: number;
  /**
   * Players who played in the current game and then left it, with the chips they left with. Coming
   * back during the same game restores those chips instead of a fresh stack (a busted player can't
   * rejoin to reset), and they still appear in the final results. Cleared when a game starts or ends.
   */
  departed: Map<PlayerId, DepartedPlayer>;
  /** The finished screen's results, while `finished`; null otherwise. */
  finalResults: FinalResult[] | null;
}

export interface DepartedPlayer {
  displayName: string;
  stack: number;
  totalBuyIn: number;
  botLevel: BotLevel | null;
}

export interface Seat {
  playerId: PlayerId;
  displayName: string;
  /** Chips between hands. During a hand the engine holds the live stack (see TableController.liveStack). */
  stack: number;
  totalBuyIn: number;
  connected: boolean;
  waitingForNextHand: boolean;
  /**
   * The player left while dealt into a hand. The seat stays (folded) until that hand is over, so the
   * hand's seats stay intact, and is freed before the next one. The player is no longer a member.
   */
  leaving: boolean;
  /** Hands started in a row while this player was disconnected (R-9.3). Reset on reconnect. */
  missedHands: number;
  /** Dealt into at least one hand of the current game (so they have a result in it). */
  played: boolean;
  /** Global join order; used to decide which duplicate name gets a " (2)" suffix. */
  joinSeq: number;
  /**
   * A computer player (§3.7) and its level; null for people. Bots have no session or socket, are
   * always connected, never host, and get no snapshots. The table plays their turns.
   */
  bot: BotLevel | null;
}

/** Every occupied seat, including players who left mid-hand. */
export function seatedPlayers(room: Room): Seat[] {
  return room.seats.filter((s): s is Seat => s !== null);
}

/** Current members: occupied seats minus players who left mid-hand. Bots included. */
export function members(room: Room): Seat[] {
  return seatedPlayers(room).filter((s) => !s.leaving);
}

/** Members who are people, not bots. A room with none left closes (its bots go too). */
export function humans(room: Room): Seat[] {
  return members(room).filter((s) => !s.bot);
}

export function seatIndexOf(room: Room, playerId: PlayerId): number {
  return room.seats.findIndex((s) => s?.playerId === playerId);
}

/** The first person's seat clockwise after `fromIndex` (wrapping), excluding `fromIndex` itself. Skips bots. */
export function nextHumanSeat(room: Room, fromIndex: number): Seat | null {
  const n = room.seats.length;
  for (let step = 1; step < n; step++) {
    const seat = room.seats[(fromIndex + step) % n];
    if (seat && !seat.leaving && !seat.bot) return seat;
  }
  return null;
}

/** Display names with " (2)", " (3)" suffixes for case-insensitive duplicates, by join order. */
function displayNames(room: Room): Map<PlayerId, string> {
  const result = new Map<PlayerId, string>();
  const seen = new Map<string, number>();
  for (const seat of [...seatedPlayers(room)].sort((a, b) => a.joinSeq - b.joinSeq)) {
    const key = seat.displayName.toLocaleLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    result.set(seat.playerId, count === 1 ? seat.displayName : `${seat.displayName} (${count})`);
  }
  return result;
}

export function toRoomView(room: Room, viewerId: PlayerId): RoomView {
  const names = displayNames(room);
  const table = room.table;
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    settings: { ...room.settings },
    youId: viewerId,
    seats: room.seats.map((seat, index): SeatView | null => {
      if (!seat) return null;
      const live = table?.liveStack(seat.playerId) ?? null;
      return {
        seat: index,
        playerId: seat.playerId,
        displayName: names.get(seat.playerId) ?? seat.displayName,
        stack: live ?? seat.stack,
        connected: seat.connected,
        waitingForNextHand: seat.waitingForNextHand,
        busted: room.status === 'playing' && live === null && seat.stack === 0,
        leaving: seat.leaving,
        isBot: seat.bot !== null,
        botLevel: seat.bot,
      };
    }),
    table: table?.tableView() ?? null,
    finalResults: room.finalResults?.map((r) => ({ ...r })) ?? null,
  };
}

/**
 * Everyone dealt into at least one hand of the game that just ended, seated or departed, ranked by
 * net result (then final stack, then name). Call between hands, when seat stacks are final.
 */
export function buildFinalResults(room: Room): FinalResult[] {
  const names = displayNames(room);
  const start = room.settings.startingStack;
  const line = (playerId: PlayerId, displayName: string, finalStack: number, totalBuyIn: number, botLevel: BotLevel | null): FinalResult => ({
    playerId,
    displayName,
    finalStack,
    totalBuyIn,
    rebuys: Math.max(0, Math.round(totalBuyIn / start) - 1),
    net: finalStack - totalBuyIn,
    botLevel,
  });
  const seated = members(room)
    .filter((s) => s.played)
    .map((s) => line(s.playerId, names.get(s.playerId) ?? s.displayName, s.stack, s.totalBuyIn, s.bot));
  const gone = [...room.departed].map(([id, d]) => line(id, d.displayName, d.stack, d.totalBuyIn, d.botLevel));
  return [...seated, ...gone].sort(
    (a, b) => b.net - a.net || b.finalStack - a.finalStack || a.displayName.localeCompare(b.displayName),
  );
}

/** The `state` payload for one player. The game part comes only from the table's `toGameView` projection. */
export function toSnapshot(room: Room, viewerId: PlayerId, serverTime: number): TableSnapshot {
  return {
    version: room.version,
    serverTime,
    room: toRoomView(room, viewerId),
    game: room.table?.gameView(viewerId) ?? null,
  };
}
