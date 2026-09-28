import {
  MAX_SEATS,
  MIN_PLAYERS_TO_START,
  changedSettingKeys,
  isValidRoomCode,
  normalizeRoomCode,
  type PlayerId,
  type RoomSettings,
} from '@poker/shared';
import type { Cancel, Clock } from '../clock';
import { DomainError } from '../errors';
import type { Timings } from '../policies';
import { nextOccupiedSeat, seatedPlayers, seatIndexOf, type Room } from './room';
import { generateUniqueRoomCode, secureRandomInt, type RandomInt } from './roomCode';

export interface PlayerRef {
  playerId: PlayerId;
  displayName: string;
}

export interface RoomManagerDeps {
  clock: Clock;
  timings: Pick<Timings, 'lobbyDisconnectGraceMs' | 'emptyRoomTtlMs'>;
  /** Called after every change to a room (the room's version has already been bumped). */
  onRoomChanged: (room: Room) => void;
  onRoomDeleted?: (code: string) => void;
  randomInt?: RandomInt;
}

/**
 * Owns all rooms, seats, hosts and the player→room index. Pure room logic: no sockets.
 * A player is in at most one room. Rules: docs/product-spec.md §3 and §5.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly roomOfPlayer = new Map<PlayerId, string>();
  private readonly graceTimers = new Map<PlayerId, Cancel>();
  private readonly emptyRoomTimers = new Map<string, Cancel>();
  private joinSeq = 0;

  constructor(private readonly deps: RoomManagerDeps) {}

  get roomCount(): number {
    return this.rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getRoomOf(playerId: PlayerId): Room | undefined {
    const code = this.roomOfPlayer.get(playerId);
    return code === undefined ? undefined : this.rooms.get(code);
  }

  create(player: PlayerRef, settings: RoomSettings): Room {
    this.removeFromCurrentRoom(player.playerId);
    const code = generateUniqueRoomCode((c) => this.rooms.has(c), this.deps.randomInt ?? secureRandomInt);
    const room: Room = {
      code,
      hostId: player.playerId,
      status: 'waiting',
      settings: { ...settings },
      seats: Array.from({ length: MAX_SEATS }, () => null),
      version: 0,
      createdAt: this.deps.clock.now(),
      emptySince: null,
    };
    this.rooms.set(code, room);
    this.seatPlayer(room, player, 0);
    this.changed(room);
    return room;
  }

  /** Joins by (untrusted) code. Idempotent for a room the player is already in. */
  join(player: PlayerRef, rawCode: string): Room {
    const code = normalizeRoomCode(rawCode);
    const room = isValidRoomCode(code) ? this.rooms.get(code) : undefined;
    if (!room) throw new DomainError('ROOM_NOT_FOUND', 'That room does not exist. Check the code and try again.');
    if (this.roomOfPlayer.get(player.playerId) === code) return room;

    const freeSeat = room.seats.findIndex((s) => s === null);
    if (freeSeat === -1) throw new DomainError('ROOM_FULL', 'That room is full.');

    // Only leave the current room once the new one is known to have space.
    this.removeFromCurrentRoom(player.playerId);
    this.seatPlayer(room, player, freeSeat);
    this.changed(room);
    return room;
  }

  leave(playerId: PlayerId): void {
    const room = this.requireRoomOf(playerId);
    this.removeFromRoom(room, playerId);
  }

  /** Removes the player from whatever room they are in, if any (e.g. their session expired). */
  removePlayer(playerId: PlayerId): void {
    this.removeFromCurrentRoom(playerId);
  }

  start(playerId: PlayerId): void {
    const room = this.requireRoomOf(playerId);
    if (room.hostId !== playerId) throw new DomainError('NOT_HOST', 'Only the host can start the game.');
    if (room.status === 'playing') throw new DomainError('INVALID_STATE', 'The game has already started.');
    if (seatedPlayers(room).length < MIN_PLAYERS_TO_START) {
      throw new DomainError('NOT_ENOUGH_PLAYERS', `At least ${MIN_PLAYERS_TO_START} players are needed to start.`);
    }
    room.status = 'playing';
    for (const seat of seatedPlayers(room)) seat.waitingForNextHand = false;
    // Phase 4: hand the room to a table controller here.
    this.changed(room);
  }

  /**
   * Host-only, and never while a game is running. In the lobby nobody has played yet, so every
   * stack simply becomes the new starting stack. In `finished`, the new settings apply on restart.
   */
  updateSettings(playerId: PlayerId, settings: RoomSettings): void {
    const room = this.requireRoomOf(playerId);
    if (room.hostId !== playerId) throw new DomainError('NOT_HOST', 'Only the host can change the settings.');
    if (room.status === 'playing') {
      throw new DomainError('INVALID_STATE', "Settings can't be changed while a game is running.");
    }
    if (changedSettingKeys(room.settings, settings).length === 0) return;

    room.settings = { ...settings };
    if (room.status === 'waiting') {
      for (const seat of seatedPlayers(room)) {
        seat.stack = settings.startingStack;
        seat.totalBuyIn = settings.startingStack;
      }
    }
    this.changed(room);
  }

  /**
   * Marks the player's seat connected or disconnected. A disconnected player in a lobby loses the
   * seat after the grace window. Returns true if anything changed.
   */
  setConnected(playerId: PlayerId, connected: boolean): boolean {
    const room = this.getRoomOf(playerId);
    const seat = room?.seats[seatIndexOf(room, playerId)];
    if (!room || !seat) return false;

    this.cancelGraceTimer(playerId);
    if (!connected && room.status === 'waiting') {
      this.graceTimers.set(
        playerId,
        this.deps.clock.schedule(this.deps.timings.lobbyDisconnectGraceMs, () => {
          this.graceTimers.delete(playerId);
          const current = this.getRoomOf(playerId);
          const currentSeat = current?.seats[seatIndexOf(current, playerId)];
          if (current && currentSeat && !currentSeat.connected && current.status === 'waiting') {
            this.removeFromRoom(current, playerId);
          }
        }),
      );
    }

    if (seat.connected === connected) return false;
    seat.connected = connected;
    this.changed(room);
    return true;
  }

  rename(playerId: PlayerId, displayName: string): void {
    const room = this.getRoomOf(playerId);
    const seat = room?.seats[seatIndexOf(room, playerId)];
    if (!room || !seat || seat.displayName === displayName) return;
    seat.displayName = displayName;
    this.changed(room);
  }

  /** Cancels all timers (server shutdown, tests). */
  dispose(): void {
    for (const cancel of this.graceTimers.values()) cancel();
    for (const cancel of this.emptyRoomTimers.values()) cancel();
    this.graceTimers.clear();
    this.emptyRoomTimers.clear();
  }

  private requireRoomOf(playerId: PlayerId): Room {
    const room = this.getRoomOf(playerId);
    if (!room) throw new DomainError('NOT_IN_ROOM', 'You are not in a room.');
    return room;
  }

  private seatPlayer(room: Room, player: PlayerRef, seatIndex: number): void {
    const wasEmpty = seatedPlayers(room).length === 0;
    room.seats[seatIndex] = {
      playerId: player.playerId,
      displayName: player.displayName,
      stack: room.settings.startingStack,
      totalBuyIn: room.settings.startingStack,
      connected: true,
      waitingForNextHand: room.status === 'playing',
      joinSeq: ++this.joinSeq,
    };
    this.roomOfPlayer.set(player.playerId, room.code);
    if (wasEmpty) room.hostId = player.playerId;
    room.emptySince = null;
    this.emptyRoomTimers.get(room.code)?.();
    this.emptyRoomTimers.delete(room.code);
  }

  private removeFromCurrentRoom(playerId: PlayerId): void {
    const room = this.getRoomOf(playerId);
    if (room) this.removeFromRoom(room, playerId);
  }

  private removeFromRoom(room: Room, playerId: PlayerId): void {
    const index = seatIndexOf(room, playerId);
    if (index === -1) return;
    // Phase 4: if a hand is running, the table controller folds the player first.
    room.seats[index] = null;
    this.roomOfPlayer.delete(playerId);
    this.cancelGraceTimer(playerId);

    if (room.hostId === playerId) {
      const next = nextOccupiedSeat(room, index);
      if (next) room.hostId = next.playerId;
    }
    if (seatedPlayers(room).length === 0) this.scheduleEmptyRoomDeletion(room);
    this.changed(room);
  }

  private scheduleEmptyRoomDeletion(room: Room): void {
    room.emptySince = this.deps.clock.now();
    this.emptyRoomTimers.get(room.code)?.();
    this.emptyRoomTimers.set(
      room.code,
      this.deps.clock.schedule(this.deps.timings.emptyRoomTtlMs, () => {
        this.emptyRoomTimers.delete(room.code);
        if (seatedPlayers(room).length > 0) return;
        this.rooms.delete(room.code);
        this.deps.onRoomDeleted?.(room.code);
      }),
    );
  }

  private cancelGraceTimer(playerId: PlayerId): void {
    this.graceTimers.get(playerId)?.();
    this.graceTimers.delete(playerId);
  }

  private changed(room: Room): void {
    room.version += 1;
    this.deps.onRoomChanged(room);
  }
}
