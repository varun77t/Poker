import {
  MAX_SEATS,
  MIN_PLAYERS_TO_START,
  changedSettingKeys,
  isValidRoomCode,
  normalizeRoomCode,
  type GameActionPayload,
  type PlayerId,
  type RoomSettings,
} from '@poker/shared';
import type { Cancel, Clock } from '../clock';
import { DomainError } from '../errors';
import { silentLogger, type Logger } from '../logger';
import { MAX_MISSED_HANDS, type Timings } from '../policies';
import { TableController, type NewDeck, type TableTimings } from '../table/tableController';
import { members, nextMemberSeat, seatIndexOf, type Room } from './room';
import { generateUniqueRoomCode, secureRandomInt, type RandomInt } from './roomCode';

export interface PlayerRef {
  playerId: PlayerId;
  displayName: string;
}

export interface RoomManagerDeps {
  clock: Clock;
  timings: Pick<Timings, 'lobbyDisconnectGraceMs' | 'emptyRoomTtlMs'> & TableTimings;
  /** Called after every change to a room (the room's version has already been bumped). */
  onRoomChanged: (room: Room) => void;
  onRoomDeleted?: (code: string) => void;
  /** Room codes, shuffles and the first button. Defaults to crypto.randomInt. */
  randomInt?: RandomInt;
  /** Test hook: the deck for each new hand. */
  newDeck?: NewDeck;
  logger?: Logger;
}

/**
 * Owns all rooms, seats, hosts and the player→room index. No sockets. A player is in at most one
 * room. Each playing room has a TableController that runs the hands. Rules: docs/product-spec.md §3 and §5.
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
      table: null,
      lastHandId: 0,
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

    // Back in a room they left during the current hand: they get their seat and chips back (still folded this hand).
    const kept = room.seats.find((s) => s?.playerId === player.playerId && s.leaving);
    if (kept) {
      this.removeFromCurrentRoom(player.playerId);
      Object.assign(kept, { leaving: false, connected: true, missedHands: 0, displayName: player.displayName });
      this.roomOfPlayer.set(player.playerId, code);
      this.changed(room);
      return room;
    }

    const freeSeat = room.seats.findIndex((s) => s === null);
    if (freeSeat === -1) throw new DomainError('ROOM_FULL', 'That room is full.');

    // Only leave the current room once the new one is known to have space.
    this.removeFromCurrentRoom(player.playerId);
    this.seatPlayer(room, player, freeSeat);
    room.table?.seatsChanged(); // a table waiting for players deals now
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
    if (members(room).length < MIN_PLAYERS_TO_START) {
      throw new DomainError('NOT_ENOUGH_PLAYERS', `At least ${MIN_PLAYERS_TO_START} players are needed to start.`);
    }
    room.status = 'playing';
    for (const seat of members(room)) {
      seat.waitingForNextHand = false;
      seat.missedHands = 0;
    }
    room.table = this.createTable(room);
    room.table.start(); // deals the first hand and sends snapshots
  }

  /** A player's game action (§6.3). Identity comes from the socket; the table checks handId/seq and legality. */
  act(playerId: PlayerId, action: GameActionPayload): void {
    const room = this.requireRoomOf(playerId);
    if (!room.table) throw new DomainError('INVALID_STATE', 'The game has not started.');
    room.table.act(playerId, action);
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
      for (const seat of members(room)) {
        seat.stack = settings.startingStack;
        seat.totalBuyIn = settings.startingStack;
      }
    }
    this.changed(room);
  }

  /**
   * Marks the player's seat connected or disconnected. A disconnected player in a lobby loses the
   * seat after the grace window; in a game they stay seated (R-9.2, R-9.3). Returns true if anything changed.
   */
  setConnected(playerId: PlayerId, connected: boolean): boolean {
    const room = this.getRoomOf(playerId);
    const seat = room?.seats[seatIndexOf(room, playerId)];
    if (!room || !seat) return false;

    this.cancelGraceTimer(playerId);
    if (connected) seat.missedHands = 0;
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

  /** Cancels all timers, including every table's (server shutdown, tests). */
  dispose(): void {
    for (const room of this.rooms.values()) room.table?.stop();
    for (const cancel of this.graceTimers.values()) cancel();
    for (const cancel of this.emptyRoomTimers.values()) cancel();
    this.graceTimers.clear();
    this.emptyRoomTimers.clear();
  }

  private createTable(room: Room): TableController {
    const { clock, timings, randomInt, newDeck, logger } = this.deps;
    return new TableController(room, {
      clock,
      timings,
      randomInt: randomInt ?? secureRandomInt,
      newDeck,
      logger: logger ?? silentLogger,
      onChange: () => this.changed(room),
      beforeHand: () => this.releaseDepartedSeats(room),
    });
  }

  private requireRoomOf(playerId: PlayerId): Room {
    const room = this.getRoomOf(playerId);
    if (!room) throw new DomainError('NOT_IN_ROOM', 'You are not in a room.');
    return room;
  }

  private seatPlayer(room: Room, player: PlayerRef, seatIndex: number): void {
    const wasEmpty = members(room).length === 0;
    room.seats[seatIndex] = {
      playerId: player.playerId,
      displayName: player.displayName,
      stack: room.settings.startingStack,
      totalBuyIn: room.settings.startingStack,
      connected: true,
      waitingForNextHand: room.status === 'playing',
      leaving: false,
      missedHands: 0,
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

  /**
   * The player stops being a member now. If they were dealt into the current hand, their hand is
   * folded and the seat is kept until the hand is over (§6.6); otherwise it is freed straight away.
   */
  private removeFromRoom(room: Room, playerId: PlayerId): void {
    const index = seatIndexOf(room, playerId);
    const seat = room.seats[index];
    if (!seat) return;
    this.roomOfPlayer.delete(playerId);
    this.cancelGraceTimer(playerId);

    const table = room.table;
    const dealtIn = table?.isDealtIn(playerId) ?? false;
    if (dealtIn) seat.leaving = true;
    else room.seats[index] = null;

    if (room.hostId === playerId) this.migrateHost(room, index);
    if (members(room).length === 0) this.closeEmptyRoom(room);
    else if (dealtIn) table?.playerLeft(playerId);
    this.changed(room);
  }

  /**
   * Between hands (called by the table before it deals): frees seats of players who left during the
   * last hand, and removes players who stayed disconnected for MAX_MISSED_HANDS hands (R-9.3). Their
   * chips leave with them. No snapshot here: the table sends one once the next hand is dealt.
   */
  private releaseDepartedSeats(room: Room): void {
    const hostIndex = seatIndexOf(room, room.hostId);
    room.seats.forEach((seat, index) => {
      if (!seat) return;
      if (seat.leaving) {
        room.seats[index] = null;
      } else if (!seat.connected && seat.missedHands >= MAX_MISSED_HANDS) {
        room.seats[index] = null;
        this.roomOfPlayer.delete(seat.playerId);
        this.cancelGraceTimer(seat.playerId);
      }
    });
    if (members(room).length === 0) this.closeEmptyRoom(room);
    else if (hostIndex !== -1 && room.seats[hostIndex] === null) this.migrateHost(room, hostIndex);
  }

  /** Host passes to the next member clockwise from the old host's seat (skipping players who left). */
  private migrateHost(room: Room, fromIndex: number): void {
    const next = nextMemberSeat(room, fromIndex);
    if (next) room.hostId = next.playerId;
  }

  /** Nobody is left: stop the game, drop seats kept for a finished hand, and start the empty-room TTL. */
  private closeEmptyRoom(room: Room): void {
    room.table?.stop();
    room.table = null;
    room.status = 'waiting';
    room.seats = room.seats.map(() => null);
    room.emptySince = this.deps.clock.now();
    this.emptyRoomTimers.get(room.code)?.();
    this.emptyRoomTimers.set(
      room.code,
      this.deps.clock.schedule(this.deps.timings.emptyRoomTtlMs, () => {
        this.emptyRoomTimers.delete(room.code);
        if (members(room).length > 0) return;
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
