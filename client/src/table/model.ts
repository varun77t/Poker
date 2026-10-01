import {
  MAX_SEATS,
  type ActionType,
  type BotLevel,
  type Card,
  type FinalResult,
  type GamePlayerView,
  type GameView,
  type HandCategory,
  type HandDraw,
  type HandHint,
  type LegalActions,
  type PlayerId,
  type RoomView,
  type SeatView,
  type TableSnapshot,
} from '@poker/shared';

/**
 * Display-only derivations for the table screen. Nothing here decides anything about the game: every
 * value comes from the server's snapshot, and this module only arranges it for the eye (where each
 * seat sits, what label a seat wears, how a result reads). Kept pure so it can be unit tested.
 */

/** Where a visual slot sits, as fractions of the felt box. Slot 0 is the viewer's chair, then clockwise. */
export interface SlotGeometry {
  seat: [x: number, y: number];
  bet: [x: number, y: number];
  dealer: [x: number, y: number];
}

export const SLOTS: readonly SlotGeometry[] = [
  { seat: [0.5, 1.02], bet: [0.5, 0.74], dealer: [0.62, 0.84] }, // you, at the bottom
  { seat: [0.02, 0.5], bet: [0.21, 0.52], dealer: [0.12, 0.3] }, // left side: bet clear of a wide plaque (a long name, a bot mark)
  { seat: [0.2, 0.02], bet: [0.28, 0.3], dealer: [0.33, 0.115] }, // top left
  { seat: [0.8, 0.02], bet: [0.72, 0.3], dealer: [0.67, 0.115] }, // top right
  { seat: [0.98, 0.5], bet: [0.79, 0.52], dealer: [0.88, 0.3] }, // right side
];

/**
 * The same five slots on a phone held upright, where the table stands as a tall oval (1 : 1.15). The
 * side seats sit low on the rail so the board can run almost the full width of the felt above them.
 * The top seats' bets sit wide, clear of the pot above the board.
 */
export const PORTRAIT_SLOTS: readonly SlotGeometry[] = [
  { seat: [0.5, 1.0], bet: [0.5, 0.715], dealer: [0.34, 0.77] }, // you, at the bottom
  { seat: [0.01, 0.69], bet: [0.3, 0.6], dealer: [0.14, 0.5] }, // left side, low
  { seat: [0.23, 0.0], bet: [0.19, 0.25], dealer: [0.34, 0.165] }, // top left
  { seat: [0.77, 0.0], bet: [0.81, 0.25], dealer: [0.66, 0.165] }, // top right
  { seat: [0.99, 0.69], bet: [0.7, 0.6], dealer: [0.86, 0.5] }, // right side, low
];

/**
 * Where a slot's seat, bet or dealer button sits, as CSS variables: `--x`/`--y` for the wide table and
 * `--px`/`--py` for the upright one. The stylesheets pick a pair by screen shape.
 */
export function slotPosition(slot: number, part: keyof SlotGeometry): Record<'--x' | '--y' | '--px' | '--py', string> {
  const [x, y] = SLOTS[slot]?.[part] ?? [0.5, 0.5];
  const [px, py] = PORTRAIT_SLOTS[slot]?.[part] ?? [0.5, 0.5];
  const pct = (n: number) => `${n * 100}%`;
  return { '--x': pct(x), '--y': pct(y), '--px': pct(px), '--py': pct(py) };
}

/** Seats run clockwise with increasing index, so rotating by the viewer's seat puts them at the bottom. */
export function slotOf(seat: number, viewerSeat: number): number {
  return (seat - viewerSeat + MAX_SEATS) % MAX_SEATS;
}

export type SeatTag =
  | { kind: 'action'; text: string }
  | { kind: 'allIn' }
  | { kind: 'blind'; text: 'SB' | 'BB' }
  | { kind: 'away' }
  | { kind: 'left' }
  | { kind: 'nextHand' }
  | { kind: 'busted' };

export interface SeatModel {
  seat: number;
  slot: number;
  view: SeatView;
  /** Null when the player is not in the current hand (waiting, busted, joined late). */
  player: GamePlayerView | null;
  isYou: boolean;
  isTurn: boolean;
  isWinner: boolean;
  folded: boolean;
  /** A hand is running and this player is not in it (joined late, out of chips, left). */
  sittingOut: boolean;
  tag: SeatTag | null;
  /** Chips shown on the plaque: what the player has behind. */
  stack: number;
}

export interface TableModel {
  viewerSeat: number;
  seats: (SeatModel | { seat: number; slot: number; empty: true })[];
  potTotal: number;
}

const ACTION_WORDS = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise' } as const;

function tagFor(view: SeatView, player: GamePlayerView | null, game: GameView | null): SeatTag | null {
  if (view.leaving) return { kind: 'left' };
  if (!view.connected) return { kind: 'away' };
  if (!player) {
    if (view.busted) return { kind: 'busted' };
    if (view.waitingForNextHand || game) return { kind: 'nextHand' };
    return null;
  }
  // A fold lasts the whole hand, so its label does too (otherwise a folded seat looks like one sitting out).
  if (player.status === 'folded') return { kind: 'action', text: 'Fold' };
  if (player.status === 'allIn') return { kind: 'allIn' };
  // Once the result is up, last-street actions would only compete with it.
  if (game?.result) return null;
  if (player.lastAction) return { kind: 'action', text: ACTION_WORDS[player.lastAction.type] };
  if (game?.street === 'preflop') {
    if (player.seat === game.bbSeat) return { kind: 'blind', text: 'BB' };
    if (player.seat === game.sbSeat) return { kind: 'blind', text: 'SB' };
  }
  return null;
}

/** Everyone who won something in this hand, with their total across pots. */
export function winnings(game: GameView): Map<PlayerId, number> {
  const totals = new Map<PlayerId, number>();
  for (const pot of game.result?.pots ?? []) {
    for (const w of pot.winners) totals.set(w.playerId, (totals.get(w.playerId) ?? 0) + w.amount);
  }
  return totals;
}

export function buildTableModel(snapshot: TableSnapshot): TableModel {
  const { room, game } = snapshot;
  const viewerSeat = Math.max(
    0,
    room.seats.findIndex((s) => s?.playerId === room.youId),
  );
  const won = game ? winnings(game) : new Map<PlayerId, number>();

  const seats = room.seats.map((view, seat) => {
    const slot = slotOf(seat, viewerSeat);
    if (!view) return { seat, slot, empty: true as const };
    const player = game?.players.find((p) => p.seat === seat && p.playerId === view.playerId) ?? null;
    return {
      seat,
      slot,
      view,
      player,
      isYou: view.playerId === room.youId,
      isTurn: !!game && !game.result && game.toActSeat === seat,
      isWinner: won.has(view.playerId),
      folded: player?.status === 'folded',
      sittingOut: !!game && !player,
      tag: tagFor(view, player, game),
      // The server already reports the live stack during a hand (chips behind, not in the pot).
      stack: view.stack,
    };
  });

  return { viewerSeat, seats, potTotal: game ? potTotal(game) : 0 };
}

/** Every chip in the middle: pots from earlier streets plus this street's bets. */
export function potTotal(game: GameView): number {
  return game.pots.reduce((sum, p) => sum + p.amount, 0) + game.players.reduce((sum, p) => sum + p.committed, 0);
}

export interface Presets {
  min: number;
  half: number;
  pot: number;
  max: number;
}

/**
 * Bet-sizing shortcuts, as "raise TO" totals clamped into the server's [minTo, maxTo]. A pot-sized
 * raise is: call first, then raise by the whole pot including that call.
 */
export function sizingPresets(game: GameView, legal: LegalActions, myCommitted: number): Presets {
  const clamp = (n: number) => Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(n)));
  const potAfterCall = potTotal(game) + legal.callAmount;
  const base = myCommitted + legal.callAmount;
  return {
    min: legal.minTo,
    half: clamp(base + potAfterCall / 2),
    pot: clamp(base + potAfterCall),
    max: legal.maxTo,
  };
}

export interface ResultSummary {
  title: string;
  subtitle: string;
  /** Cards to lift (the winning five); everything else shown is dimmed. Empty when won by folds. */
  highlight: Set<Card>;
}

const fmt = (n: number) => n.toLocaleString('en-US');

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** How a finished hand reads on the felt. `nameOf` returns "You" for the viewer. */
export function summarizeResult(game: GameView, nameOf: (playerId: PlayerId) => string): ResultSummary | null {
  const result = game.result;
  if (!result) return null;
  const totals = [...winnings(game)].sort((a, b) => b[1] - a[1]);
  const verb = (id: PlayerId) => (nameOf(id) === 'You' ? 'win' : 'wins');

  if (result.wonByFold) {
    const [id, amount] = totals[0] ?? ['', 0];
    return { title: `${nameOf(id)} ${verb(id)} ${fmt(amount)}`, subtitle: 'Everyone else folded', highlight: new Set() };
  }

  const shownBy = new Map(result.shown.map((s) => [s.playerId, s]));
  const highlight = new Set<Card>(totals.flatMap(([id]) => shownBy.get(id)?.best5 ?? []));
  const labels = [...new Set(totals.map(([id]) => shownBy.get(id)?.label).filter((l): l is string => !!l))];

  let title: string;
  if (totals.length === 1) {
    const [id, amount] = totals[0] as [PlayerId, number];
    title = `${nameOf(id)} ${verb(id)} ${fmt(amount)}`;
  } else if (new Set(totals.map(([, a]) => a)).size === 1) {
    title = `${joinNames(totals.map(([id]) => nameOf(id)))} split ${fmt(totals.reduce((s, [, a]) => s + a, 0))}`;
  } else {
    title = totals.map(([id, amount]) => `${nameOf(id)} ${verb(id)} ${fmt(amount)}`).join(', ');
  }
  return { title, subtitle: labels.join(' / '), highlight };
}

/** A net result with its sign: "+240", "−1,000" (a true minus sign), or "Even". */
export function formatNet(net: number): string {
  if (net === 0) return 'Even';
  return `${net > 0 ? '+' : '−'}${fmt(Math.abs(net))}`;
}

export interface Standing extends FinalResult {
  /** 1-based; players with the same net share a rank. */
  rank: number;
  /** Had the best net result (ties included), when anyone came out ahead. */
  isTop: boolean;
  isYou: boolean;
  /** No longer seated in the room (left during or after the game). */
  left: boolean;
}

/** The server's final results (already ranked by net) with display ranks and flags. */
export function buildStandings(room: RoomView): Standing[] {
  const results = room.finalResults ?? [];
  const seated = new Set(room.seats.flatMap((s) => (s ? [s.playerId] : [])));
  const best = results[0]?.net ?? 0;
  return results.map((r) => ({
    ...r,
    rank: results.findIndex((x) => x.net === r.net) + 1,
    isTop: best > 0 && r.net === best,
    isYou: r.playerId === room.youId,
    left: !seated.has(r.playerId),
  }));
}

/** The game's headline on the felt. `nameOf` returns "You" for the viewer. */
export function summarizeGame(standings: Standing[], nameOf: (s: Standing) => string): { title: string; subtitle: string } {
  const top = standings.filter((s) => s.isTop);
  if (top.length === 0) return { title: 'Game over', subtitle: standings.length > 0 ? 'Everyone finished even' : '' };
  const names = top.map(nameOf);
  const up = fmt(top[0]?.net ?? 0);
  if (top.length === 1) {
    return { title: `${names[0]} ${names[0] === 'You' ? 'win' : 'wins'} the game`, subtitle: `${up} chips up` };
  }
  return { title: `${joinNames(names)} share the top`, subtitle: `${up} chips up each` };
}

/** Chip colours for a stack of `amount`, bottom first. Purely decorative. */
export function chipColors(amount: number): ('red' | 'blue' | 'black' | 'green')[] {
  if (amount >= 1000) return ['black', 'black', 'green', 'blue', 'red'];
  if (amount >= 500) return ['black', 'black', 'blue', 'red'];
  if (amount >= 100) return ['black', 'blue', 'red'];
  if (amount >= 25) return ['blue', 'red'];
  return ['red'];
}

/** How each bot level is named and described wherever it is shown or picked (product-spec §3.7). */
export const BOT_LEVEL_TEXT: Record<BotLevel, { name: string; blurb: string }> = {
  easy: { name: 'Easy', blurb: 'Calls a lot' },
  medium: { name: 'Medium', blurb: 'Plays solid poker' },
  pro: { name: 'Pro', blurb: 'Reads you, bluffs well' },
};

/**
 * Why no hand is being dealt, and who can get the table going again (R-10.4, R-10.6): the busted
 * people by name (if rebuys are on), someone who is away, a new friend, or (for the host) a bot.
 */
export function waitingHint({ room }: TableSnapshot): string {
  const isHost = room.hostId === room.youId;
  const seats = room.seats.filter((s) => s !== null && !s.leaving);
  const nameOf = (s: (typeof seats)[number]) => (s?.playerId === room.youId ? 'You' : (s?.displayName ?? ''));
  const list = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);
  const withChips = seats.filter((s) => s && s.stack > 0);
  const people = withChips.filter((s) => s && !s.isBot);
  const rebuyers = room.settings.rebuys ? seats.filter((s) => s?.busted && !s.isBot).map(nameOf) : [];

  const invite = `Invite a friend with code ${room.code}`;
  const parts: string[] = [];
  if (withChips.length >= 2) {
    // Enough chips at the table, but no person here to play them with the bots.
    const bots = withChips.filter((s) => s?.isBot).length;
    if (bots > 0) parts.push(bots === 1 ? "The bot doesn't play on its own." : "The bots don't play on their own.");
    if (people.length > 0) parts.push(`Waiting for ${list(people.map(nameOf))} to come back.`);
    if (rebuyers.length > 0) parts.push(`${list(rebuyers)} can rebuy.`);
    parts.push(isHost ? `${invite}, or end the game from the top bar.` : `${invite}.`);
  } else {
    parts.push('A hand needs two players with chips.');
    if (rebuyers.length > 0) parts.push(`${list(rebuyers)} can rebuy.`);
    parts.push(isHost ? `${invite}, add a bot, or end the game from the top bar.` : `${invite}.`);
  }
  return parts.join(' ');
}

/** The nine kinds of hand, best first, as the hand hint's ladder shows them (game-rules §8). */
export const HAND_LADDER: readonly { category: HandCategory; name: string }[] = [
  { category: 'straightFlush', name: 'Straight flush' },
  { category: 'quads', name: 'Four of a kind' },
  { category: 'fullHouse', name: 'Full house' },
  { category: 'flush', name: 'Flush' },
  { category: 'straight', name: 'Straight' },
  { category: 'trips', name: 'Three of a kind' },
  { category: 'twoPair', name: 'Two pair' },
  { category: 'pair', name: 'Pair' },
  { category: 'highCard', name: 'High card' },
];

/** The kind of hand each draw would make. */
export const DRAW_TARGET: Record<HandDraw, HandCategory> = { flushDraw: 'flush', straightDraw: 'straight', gutshot: 'straight' };

/** The hint's second line: what the viewer is drawing to, and whether the board alone makes their hand. */
export function hintNotes(hint: HandHint): string[] {
  const notes: string[] = [];
  if (hint.onBoard) notes.push("It's all on the board.");
  const targets = hint.draws.map((d) => (d === 'flushDraw' ? 'a flush' : d === 'straightDraw' ? 'a straight' : 'an inside straight'));
  if (targets.length > 0) notes.push(`Drawing to ${targets.join(' or ')}.`);
  return notes;
}

/** The action panel's keys: F folds, C checks or calls, R bets or raises to the amount chosen. */
export const SHORTCUT_KEYS = { fold: 'F', call: 'C', raise: 'R' } as const;

/**
 * What a key press asks for on the viewer's turn, or null when the key means nothing or its action
 * is not legal now. The server still decides; this only picks which legal button the key presses.
 */
export function shortcutAction(key: string, legal: LegalActions): ActionType | null {
  switch (key.toLowerCase()) {
    case 'f':
      return legal.canFold ? 'fold' : null;
    case 'c':
      return legal.canCheck ? 'check' : legal.canCall ? 'call' : null;
    case 'r':
      return legal.canBet ? 'bet' : legal.canRaise ? 'raise' : null;
    default:
      return null;
  }
}

export { fmt as formatChips };
