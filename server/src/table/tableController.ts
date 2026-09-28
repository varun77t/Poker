import {
  MIN_PLAYERS_TO_START,
  type ActionIntent,
  type Card,
  type GameActionPayload,
  type GameView,
  type PlayerId,
  type TableView,
} from '@poker/shared';
import type { Cancel, Clock } from '../clock';
import {
  advance,
  applyAction,
  createHand,
  firstButtonSeat,
  forceFold,
  getLegalActions,
  nextButtonSeat,
  shuffledDeck,
  toGameView,
  type HandState,
  type RandomInt,
} from '../engine';
import { DomainError } from '../errors';
import type { Logger } from '../logger';
import type { Timings } from '../policies';
import { members, type Room } from '../rooms/room';

/** Builds the deck for a hand about to be dealt (tests stack decks around the chosen button). */
export type NewDeck = (hand: { handId: number; buttonSeat: number; seats: number[] }) => Card[];

export type TableTimings = Pick<Timings, 'streetDelayMs' | 'runOutDelayMs' | 'showdownPauseMs' | 'foldWinPauseMs'>;

export interface TableDeps {
  clock: Clock;
  timings: TableTimings;
  /** Shuffles and the first button. Production passes crypto.randomInt. */
  randomInt: RandomInt;
  /** Test hook: the deck for each new hand, top card first. Defaults to a secure shuffle. */
  newDeck?: NewDeck;
  logger: Logger;
  /** Something players can see changed: the room manager bumps the version and sends snapshots. */
  onChange: () => void;
  /**
   * Runs before each hand is dealt. The room manager frees the seats of players who left during the
   * last hand or have been away too long (R-9.3). It may stop this table if nobody is left.
   */
  beforeHand: () => void;
}

/** What the single pending timer will do. */
export type PendingTimer = 'turn' | 'deal' | 'nextHand';

/**
 * Runs the game for one playing room (docs/architecture.md §4, §6.3–6.5). It holds the only copy of
 * the live hand, feeds player actions and turn timeouts to the pure engine, paces streets and
 * results, moves the button between hands and applies each hand's result to the seats.
 *
 * There is at most one timer at a time. Every transition cancels it and schedules the next one, and
 * each callback also checks that the hand is still at the (handId, seq) it was scheduled for.
 */
export class TableController {
  private hand: HandState | null = null;
  private buttonSeat: number | null = null;
  private turnDeadline: number | null = null;
  private nextHandAt: number | null = null;
  private waitingForPlayers = false;
  private timer: { kind: PendingTimer; cancel: Cancel } | null = null;
  private stopped = false;

  constructor(
    private readonly room: Room,
    private readonly deps: TableDeps,
  ) {}

  /** Deals the first hand. */
  start(): void {
    this.dealNextHand();
  }

  /** Cancels timers for good (the room emptied, or the server is shutting down). */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  // ---------------------------------------------------------------- views

  /** The viewer's projection of the current (or just finished) hand. The only way hand state leaves. */
  gameView(viewerId: PlayerId): GameView | null {
    return this.hand ? toGameView(this.hand, viewerId, { turnDeadline: this.turnDeadline }) : null;
  }

  tableView(): TableView {
    return { nextHandAt: this.nextHandAt, waitingForPlayers: this.waitingForPlayers };
  }

  /** A dealt-in player's chips behind while a hand is running; null otherwise (use the seat's stack). */
  liveStack(playerId: PlayerId): number | null {
    if (!this.hand || this.hand.awaiting === 'none') return null;
    return this.hand.players.find((p) => p.playerId === playerId)?.stack ?? null;
  }

  /** True if the player was dealt into the current hand, including during its results pause. */
  isDealtIn(playerId: PlayerId): boolean {
    return this.hand?.players.some((p) => p.playerId === playerId) ?? false;
  }

  /** For tests and diagnostics. */
  get pendingTimer(): PendingTimer | null {
    return this.timer?.kind ?? null;
  }

  // --------------------------------------------------------------- inputs

  /** A player's action (§6.3). Throws a DomainError (sent back in the ack) if it can't be applied. */
  act(playerId: PlayerId, { handId, seq, type, amount }: GameActionPayload): void {
    const hand = this.hand;
    if (!hand) throw new DomainError('INVALID_STATE', 'No hand is being played right now.');
    if (handId !== hand.handId || seq !== hand.seq) {
      throw new DomainError('STALE_ACTION', 'The table moved on before your action arrived.');
    }
    const intent: ActionIntent = amount === undefined ? { type } : { type, amount };
    const result = applyAction(hand, playerId, intent);
    if (!result.ok) throw new DomainError(result.error.code, result.error.message);
    this.update(result.state);
  }

  /** The player left or was removed during a hand: fold them now (R-9.1). Their seat is freed before the next hand. */
  playerLeft(playerId: PlayerId): void {
    const hand = this.hand;
    if (!hand || this.stopped) return;
    const { state } = forceFold(hand, playerId);
    if (state === hand) return; // not in the hand, already folded, all-in, or the hand is over
    // Someone else folding must not restart the clock of the player whose turn it is.
    const sameTurn =
      state.awaiting === 'action' && hand.awaiting === 'action' && state.toActSeat === hand.toActSeat && state.street === hand.street;
    this.update(state, sameTurn);
  }

  /** Seats changed (someone joined). A table waiting for players tries to deal again. */
  seatsChanged(): void {
    if (this.waitingForPlayers && !this.stopped) this.dealNextHand();
  }

  // -------------------------------------------------------------- the loop

  private dealNextHand(): void {
    this.clearTimer();
    this.hand = null;
    this.turnDeadline = null;
    this.nextHandAt = null;
    this.deps.beforeHand();
    if (this.stopped) return;

    // R-10.3: late joiners are dealt in from this hand on.
    for (const seat of members(this.room)) seat.waitingForNextHand = false;

    // R-2.1, R-10.1: only members with chips are dealt in.
    const players = this.room.seats.flatMap((seat, index) =>
      seat && !seat.leaving && seat.stack > 0 ? [{ playerId: seat.playerId, seat: index, stack: seat.stack }] : [],
    );
    if (players.length < MIN_PLAYERS_TO_START) {
      this.waitingForPlayers = true; // R-10.4
      this.deps.onChange();
      return;
    }
    this.waitingForPlayers = false;

    const seats = players.map((p) => p.seat);
    this.buttonSeat =
      this.buttonSeat === null ? firstButtonSeat(seats, this.deps.randomInt) : nextButtonSeat(this.buttonSeat, seats); // R-2.2
    const handId = ++this.room.lastHandId;
    const buttonSeat = this.buttonSeat;
    const { state } = createHand({
      handId,
      players,
      buttonSeat,
      smallBlind: this.room.settings.smallBlind,
      bigBlind: this.room.settings.bigBlind,
      deck: this.deps.newDeck?.({ handId, buttonSeat, seats }) ?? shuffledDeck(this.deps.randomInt),
    });

    // R-9.3: count hands that start while a member is away.
    for (const seat of members(this.room)) if (!seat.connected) seat.missedHands += 1;

    this.deps.logger.debug(`room ${this.room.code}: hand ${state.handId} dealt to ${players.length} players`);
    this.update(state);
  }

  /** Stores the new hand state, schedules whatever comes next, and tells everyone. */
  private update(next: HandState, keepTurnDeadline = false): void {
    this.hand = next;
    this.clearTimer();
    const { handId, seq } = next;
    const now = this.deps.clock.now();

    if (next.awaiting === 'action') {
      const deadline =
        keepTurnDeadline && this.turnDeadline !== null ? this.turnDeadline : now + this.room.settings.turnSeconds * 1000;
      this.turnDeadline = deadline;
      this.setTimer('turn', deadline - now, () => this.timeOut(handId, seq));
    } else {
      this.turnDeadline = null;
      if (next.awaiting === 'deal') {
        const { runOutDelayMs, streetDelayMs } = this.deps.timings;
        this.setTimer('deal', next.allRevealed ? runOutDelayMs : streetDelayMs, () => this.dealStreet(handId, seq));
      } else {
        this.finishHand(next);
      }
    }
    this.deps.onChange();
  }

  /** R-9.2: when the turn timer runs out, check if that's legal, otherwise fold. Connected or not. */
  private timeOut(handId: number, seq: number): void {
    const hand = this.current(handId, seq);
    if (!hand || hand.awaiting !== 'action') return;
    const actor = hand.players.find((p) => p.seat === hand.toActSeat);
    const legal = actor ? getLegalActions(hand, actor.playerId) : null;
    if (!actor || !legal) throw new Error('Turn timer fired with nobody to act');
    const result = applyAction(hand, actor.playerId, { type: legal.canCheck ? 'check' : 'fold' });
    if (!result.ok) throw new Error(`Timeout action rejected: ${result.error.message}`);
    this.update(result.state);
  }

  private dealStreet(handId: number, seq: number): void {
    const hand = this.current(handId, seq);
    if (!hand || hand.awaiting !== 'deal') return;
    this.update(advance(hand).state);
  }

  /** The hand is over: seats take their final stacks (R-7.6), and the next hand follows the results pause. */
  private finishHand(hand: HandState): void {
    for (const p of hand.players) {
      const seat = this.room.seats[p.seat];
      if (seat?.playerId === p.playerId) seat.stack = p.stack;
    }
    const { foldWinPauseMs, showdownPauseMs } = this.deps.timings;
    const pause = hand.result?.wonByFold ? foldWinPauseMs : showdownPauseMs;
    this.nextHandAt = this.deps.clock.now() + pause;
    this.setTimer('nextHand', pause, () => this.dealNextHand());
    this.deps.logger.debug(`room ${this.room.code}: hand ${hand.handId} finished`);
  }

  // --------------------------------------------------------------- timers

  private current(handId: number, seq: number): HandState | null {
    const hand = this.hand;
    return hand && hand.handId === handId && hand.seq === seq ? hand : null;
  }

  private setTimer(kind: PendingTimer, delayMs: number, fn: () => void): void {
    this.clearTimer();
    const cancel = this.deps.clock.schedule(Math.max(0, delayMs), () => {
      this.timer = null;
      if (this.stopped) return;
      try {
        fn();
      } catch (err) {
        // Timer callbacks run outside any socket handler; never let one take the process down.
        this.deps.logger.error(`room ${this.room.code}: ${kind} timer failed`, err);
      }
    });
    this.timer = { kind, cancel };
  }

  private clearTimer(): void {
    this.timer?.cancel();
    this.timer = null;
  }
}
