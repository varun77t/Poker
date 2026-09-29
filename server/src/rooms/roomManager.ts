import {
  MAX_SEATS,
  MIN_PLAYERS_TO_START,
  changedSettingKeys,
  isValidRoomCode,
  normalizeRoomCode,
  type BotLevel,
  type GameActionPayload,
  type PlayerId,
  type RoomSettings,
} from '@poker/shared';
import { pickBotName } from '../bots';
import type { Cancel, Clock } from '../clock';
import { DomainError } from '../errors';
import { silentLogger, type Logger } from '../logger';
import { MAX_MISSED_HANDS, type Timings } from '../policies';
import { TableController, type NewDeck, type TableTimings } from '../table/tableController';
import { buildFinalResults, humans, members, nextHumanSeat, seatIndexOf, seatedPlayers, type Room } from './room';
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
 * room. Each playing room has a TableController that runs the hands. Rules: docs/product-spec.md §3–§5.
 *
 * Room lifecycle: `waiting` (lobby) → `playing` (host starts) → `finished` (host ends it, or rebuys are
 * off and one player is left with chips) → `playing` again on restart, with fresh stacks.
 *
 * Bots (§3.7) sit in seats like players but have no session: they are not in the player→room
 * index, never host, and leave with the last person.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly roomOfPlayer = new Map<PlayerId, string>();
  private readonly graceTimers = new Map<PlayerId, Cancel>();
  private readonly emptyRoomTimers = new Map<string, Cancel>();
  private joinSeq = 0;
  private botSeq = 0;

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

  /** Creates a room with the player as host, plus any bots they asked for ("Play against bots"). */
  create(player: PlayerRef, settings: RoomSettings, bots: readonly BotLevel[] = []): Room {
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
      departed: new Map(),
      finalResults: null,
    };
    this.rooms.set(code, room);
    this.seatPlayer(room, player, 0);
    for (const level of bots) this.seatBot(room, level);
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
    // Back in a game they played earlier: the chips they left with, not a fresh stack (not even when busted).
    const returning = room.departed.get(player.playerId);
    const seat = room.seats[freeSeat];
    if (returning && seat) {
      room.departed.delete(player.playerId);
      Object.assign(seat, { stack: returning.stack, totalBuyIn: returning.totalBuyIn, played: true });
    }
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

  /** Starts the game from the lobby, or restarts it from the finished screen. Everyone gets a fresh starting stack. */
  start(playerId: PlayerId): void {
    const room = this.requireRoomOf(playerId);
    if (room.hostId !== playerId) throw new DomainError('NOT_HOST', 'Only the host can start the game.');
    if (room.status === 'playing') throw new DomainError('INVALID_STATE', 'The game has already started.');
    if (members(room).length < MIN_PLAYERS_TO_START) {
      throw new DomainError('NOT_ENOUGH_PLAYERS', `At least ${MIN_PLAYERS_TO_START} players are needed to start.`);
    }
    room.status = 'playing';
    room.finalResults = null;
    room.departed.clear();
    for (const seat of members(room)) {
      Object.assign(seat, {
        stack: room.settings.startingStack,
        totalBuyIn: room.settings.startingStack,
        waitingForNextHand: false,
        missedHands: 0,
        played: false,
      });
      this.cancelGraceTimer(seat.playerId);
    }
    room.table = this.createTable(room);
    room.table.start(); // deals the first hand and sends snapshots
  }

  /**
   * R-10.2: a busted player buys back in for the starting stack. Allowed whenever they are not in a
   * hand being played (sitting out, or during the results of the hand they busted in); the chips play
   * from the next hand. A table waiting for players deals straight away.
   */
  rebuy(playerId: PlayerId): void {
    const room = this.requireRoomOf(playerId);
    const seat = room.seats[seatIndexOf(room, playerId)];
    if (!seat || room.status !== 'playing' || !room.table) {
      throw new DomainError('INVALID_STATE', 'You can only rebuy while a game is running.');
    }
    if (!room.settings.rebuys) throw new DomainError('REBUY_NOT_ALLOWED', 'Rebuys are off in this room.');
    if (room.table.isPlayingHand(playerId)) {
      throw new DomainError('REBUY_NOT_ALLOWED', 'You can rebuy once this hand is over.');
    }
    if (seat.stack > 0) throw new DomainError('REBUY_NOT_ALLOWED', 'You can only rebuy when you are out of chips.');

    seat.stack = room.settings.startingStack;
    seat.totalBuyIn += room.settings.startingStack;
    room.table.seatsChanged();
    this.changed(room);
  }

  /** Host only (R-10.4). Ends at once between hands; otherwise after the current hand and its results. */
  endGame(playerId: PlayerId): void {
    const room = this.requireRoomOf(playerId);
    if (room.hostId !== playerId) throw new DomainError('NOT_HOST', 'Only the host can end the game.');
    if (room.status !== 'playing' || !room.table) throw new DomainError('INVALID_STATE', 'No game is running.');
    room.table.requestEnd(); // sends the snapshot itself: "ending after this hand", or the results
  }

  /**
   * Host only (§3.7): seats a bot in the open seat the host picked (or the lowest open seat) and
   * returns it. Allowed whenever a seat is open; during a game the bot is dealt in from the next
   * hand, like a late joiner.
   */
  addBot(playerId: PlayerId, level: BotLevel, seatIndex?: number): number {
    const room = this.requireRoomOf(playerId);
    if (room.hostId !== playerId) throw new DomainError('NOT_HOST', 'Only the host can add bots.');
    const seat = this.seatBot(room, level, seatIndex);
    room.table?.seatsChanged(); // a table waiting for players deals now
    this.changed(room);
    return seat;
  }

  /** Host only. A bot dealt into the current hand folds now and its seat is freed after the hand. */
  removeBot(playerId: PlayerId, seatIndex: number): void {
    const room = this.requireRoomOf(playerId);
    if (room.hostId !== playerId) throw new DomainError('NOT_HOST', 'Only the host can remove bots.');
    const seat = room.seats[seatIndex];
    if (!seat?.bot || seat.leaving) throw new DomainError('INVALID_STATE', 'There is no bot in that seat.');
    this.removeFromRoom(room, seat.playerId);
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
   * Marks the player's seat connected or disconnected. A disconnected player in a lobby or on the
   * finished screen loses the seat after the grace window; in a game they stay seated (R-9.2, R-9.3).
   * Returns true if anything changed.
   */
  setConnected(playerId: PlayerId, connected: boolean): boolean {
    const room = this.getRoomOf(playerId);
    const seat = room?.seats[seatIndexOf(room, playerId)];
    if (!room || !seat) return false;

    this.cancelGraceTimer(playerId);
    if (connected) seat.missedHands = 0;
    if (!connected && room.status !== 'playing') this.startGraceTimer(playerId);

    if (seat.connected === connected) return false;
    seat.connected = connected;
    // Back at a table that paused because no person with chips was here (R-10.6): deal again.
    if (connected) room.table?.seatsChanged();
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
      onGameOver: () => this.finishGame(room),
    });
  }

  /**
   * Between hands: the game is over. Results are fixed now (seated and departed players), the room
   * shows them until the host restarts, and disconnected players get the lobby's grace window.
   */
  private finishGame(room: Room): void {
    room.table?.stop();
    room.table = null;
    room.status = 'finished';
    room.finalResults = buildFinalResults(room);
    room.departed.clear();
    for (const seat of members(room)) {
      seat.waitingForNextHand = false;
      seat.missedHands = 0;
      if (!seat.connected) this.startGraceTimer(seat.playerId);
    }
    this.deps.logger?.debug(`room ${room.code}: game over after hand ${room.lastHandId}`);
    this.changed(room);
  }

  /** A disconnected player outside a running game loses their seat unless they are back within the grace window. */
  private startGraceTimer(playerId: PlayerId): void {
    this.cancelGraceTimer(playerId);
    this.graceTimers.set(
      playerId,
      this.deps.clock.schedule(this.deps.timings.lobbyDisconnectGraceMs, () => {
        this.graceTimers.delete(playerId);
        const current = this.getRoomOf(playerId);
        const currentSeat = current?.seats[seatIndexOf(current, playerId)];
        if (current && currentSeat && !currentSeat.connected && current.status !== 'playing') {
          this.removeFromRoom(current, playerId);
        }
      }),
    );
  }

  private requireRoomOf(playerId: PlayerId): Room {
    const room = this.getRoomOf(playerId);
    if (!room) throw new DomainError('NOT_IN_ROOM', 'You are not in a room.');
    return room;
  }

  private seatPlayer(room: Room, player: PlayerRef, seatIndex: number): void {
    const wasEmpty = humans(room).length === 0;
    room.seats[seatIndex] = {
      playerId: player.playerId,
      displayName: player.displayName,
      stack: room.settings.startingStack,
      totalBuyIn: room.settings.startingStack,
      connected: true,
      waitingForNextHand: room.status === 'playing',
      leaving: false,
      missedHands: 0,
      played: false,
      joinSeq: ++this.joinSeq,
      bot: null,
    };
    this.roomOfPlayer.set(player.playerId, room.code);
    if (wasEmpty) room.hostId = player.playerId;
    room.emptySince = null;
    this.emptyRoomTimers.get(room.code)?.();
    this.emptyRoomTimers.delete(room.code);
  }

  /** Seats a bot at `wanted` (or the lowest open seat), named uniquely within the room. Returns the seat. */
  private seatBot(room: Room, level: BotLevel, wanted?: number): number {
    const index = wanted ?? room.seats.findIndex((s) => s === null);
    if (index === -1) throw new DomainError('ROOM_FULL', 'The table is full.');
    if (room.seats[index] !== null) throw new DomainError('INVALID_STATE', 'That seat is taken.');
    const { startingStack } = room.settings;
    room.seats[index] = {
      playerId: `bot:${++this.botSeq}`, // never a session id (those are UUIDs), so no one can act as a bot
      displayName: pickBotName(seatedPlayers(room).map((s) => s.displayName)),
      stack: startingStack,
      totalBuyIn: startingStack,
      connected: true,
      waitingForNextHand: room.status === 'playing',
      leaving: false,
      missedHands: 0,
      played: false,
      joinSeq: ++this.joinSeq,
      bot: level,
    };
    return index;
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
    else this.freeSeat(room, index);

    if (room.hostId === playerId) this.migrateHost(room, index);
    if (humans(room).length === 0) this.closeEmptyRoom(room); // bots never stay on without people
    else if (dealtIn) table?.playerLeft(playerId);
    else table?.seatsChanged(); // a paused table may have nobody left to play on (R-10.4, R-10.6)
    this.changed(room);
  }

  /**
   * Between hands (called by the table before it deals): frees seats of players who left during the
   * last hand, and removes players who stayed disconnected for MAX_MISSED_HANDS hands (R-9.3). Their
   * chips leave with them. Busted bots rebuy, or leave when rebuys are off (§3.7). No snapshot here:
   * the table sends one once the next hand is dealt.
   */
  private releaseDepartedSeats(room: Room): void {
    const hostIndex = seatIndexOf(room, room.hostId);
    room.seats.forEach((seat, index) => {
      if (!seat) return;
      if (seat.leaving) {
        this.freeSeat(room, index);
      } else if (!seat.connected && seat.missedHands >= MAX_MISSED_HANDS) {
        this.freeSeat(room, index);
        this.roomOfPlayer.delete(seat.playerId);
        this.cancelGraceTimer(seat.playerId);
      } else if (seat.bot && seat.stack === 0) {
        if (room.settings.rebuys) {
          seat.stack = room.settings.startingStack;
          seat.totalBuyIn += room.settings.startingStack;
        } else {
          this.freeSeat(room, index);
        }
      }
    });
    if (humans(room).length === 0) this.closeEmptyRoom(room);
    else if (hostIndex !== -1 && room.seats[hostIndex] === null) this.migrateHost(room, hostIndex);
  }

  /** Empties a seat. During a game, a player who played remembers their chips (see Room.departed). */
  private freeSeat(room: Room, index: number): void {
    const seat = room.seats[index];
    if (seat && room.status === 'playing' && seat.played) {
      room.departed.set(seat.playerId, {
        displayName: seat.displayName,
        stack: seat.stack,
        totalBuyIn: seat.totalBuyIn,
        botLevel: seat.bot,
      });
    }
    room.seats[index] = null;
  }

  /** Host passes to the next person clockwise from the old host's seat (skipping bots and players who left). */
  private migrateHost(room: Room, fromIndex: number): void {
    const next = nextHumanSeat(room, fromIndex);
    if (next) room.hostId = next.playerId;
  }

  /** Nobody is left: stop the game, drop seats kept for a finished hand, and start the empty-room TTL. */
  private closeEmptyRoom(room: Room): void {
    room.table?.stop();
    room.table = null;
    room.status = 'waiting';
    room.seats = room.seats.map(() => null);
    room.departed.clear();
    room.finalResults = null;
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
