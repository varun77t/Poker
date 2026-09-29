import {
  MAX_SEATS,
  type Card,
  type GamePlayerView,
  type GameView,
  type LegalActions,
  type PlayerId,
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
  { seat: [0.02, 0.5], bet: [0.17, 0.52], dealer: [0.12, 0.3] }, // left side
  { seat: [0.2, 0.02], bet: [0.28, 0.3], dealer: [0.33, 0.115] }, // top left
  { seat: [0.8, 0.02], bet: [0.72, 0.3], dealer: [0.67, 0.115] }, // top right
  { seat: [0.98, 0.5], bet: [0.83, 0.52], dealer: [0.88, 0.3] }, // right side
];

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

/** Chip colours for a stack of `amount`, bottom first. Purely decorative. */
export function chipColors(amount: number): ('red' | 'blue' | 'black' | 'green')[] {
  if (amount >= 1000) return ['black', 'black', 'green', 'blue', 'red'];
  if (amount >= 500) return ['black', 'black', 'blue', 'red'];
  if (amount >= 100) return ['black', 'blue', 'red'];
  if (amount >= 25) return ['blue', 'red'];
  return ['red'];
}

export { fmt as formatChips };
