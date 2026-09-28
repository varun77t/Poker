import type { PlayerId, RoomSettings, RoomStatus, RoomView, SeatView, TableSnapshot } from '@poker/shared';

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
}

export interface Seat {
  playerId: PlayerId;
  displayName: string;
  stack: number;
  totalBuyIn: number;
  connected: boolean;
  waitingForNextHand: boolean;
  /** Global join order; used to decide which duplicate name gets a " (2)" suffix. */
  joinSeq: number;
}

export function seatedPlayers(room: Room): Seat[] {
  return room.seats.filter((s): s is Seat => s !== null);
}

export function seatIndexOf(room: Room, playerId: PlayerId): number {
  return room.seats.findIndex((s) => s?.playerId === playerId);
}

/** The first occupied seat clockwise after `fromIndex` (wrapping), excluding `fromIndex` itself. */
export function nextOccupiedSeat(room: Room, fromIndex: number): Seat | null {
  const n = room.seats.length;
  for (let step = 1; step < n; step++) {
    const seat = room.seats[(fromIndex + step) % n];
    if (seat) return seat;
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
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    settings: { ...room.settings },
    youId: viewerId,
    seats: room.seats.map((seat, index): SeatView | null =>
      seat
        ? {
            seat: index,
            playerId: seat.playerId,
            displayName: names.get(seat.playerId) ?? seat.displayName,
            stack: seat.stack,
            connected: seat.connected,
            waitingForNextHand: seat.waitingForNextHand,
            busted: false,
          }
        : null,
    ),
    finalResults: null,
  };
}

export function toSnapshot(room: Room, viewerId: PlayerId): TableSnapshot {
  return { version: room.version, room: toRoomView(room, viewerId), game: null };
}
