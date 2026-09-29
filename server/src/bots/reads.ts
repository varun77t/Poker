import type { PlayerId, PublicAction } from '@poker/shared';

/**
 * What a bot remembers about how each player plays, built only from public actions (the betting
 * everyone at the table saw), never from hidden cards. Pro bots use it to adjust: bluff less against
 * players who call everything, fold more to players who only bet strong hands, and so on.
 */
export interface PlayerRead {
  /** Hands dealt in. */
  hands: number;
  /** Hands where they put chips in voluntarily before the flop (call, bet or raise; blinds don't count). */
  vpip: number;
  /** Hands where they raised before the flop. */
  pfr: number;
  /** Bets and raises after the flop. */
  bets: number;
  /** Calls after the flop. */
  calls: number;
  /** Folds after the flop (facing a bet). */
  folds: number;
}

export type Reads = ReadonlyMap<PlayerId, PlayerRead>;

const empty = (): PlayerRead => ({ hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0, folds: 0 });

/** Adds a finished hand's public history to `reads`. `players` are everyone dealt in, by seat. */
export function recordHand(
  reads: Map<PlayerId, PlayerRead>,
  players: readonly { seat: number; playerId: PlayerId }[],
  history: readonly PublicAction[],
): void {
  for (const { seat, playerId } of players) {
    const read = reads.get(playerId) ?? empty();
    const mine = history.filter((a) => a.seat === seat);
    read.hands += 1;
    const preflop = mine.filter((a) => a.street === 'preflop');
    if (preflop.some((a) => a.type === 'call' || a.type === 'bet' || a.type === 'raise')) read.vpip += 1;
    if (preflop.some((a) => a.type === 'bet' || a.type === 'raise')) read.pfr += 1;
    for (const a of mine) {
      if (a.street === 'preflop') continue;
      if (a.type === 'bet' || a.type === 'raise') read.bets += 1;
      else if (a.type === 'call') read.calls += 1;
      else if (a.type === 'fold') read.folds += 1;
    }
    reads.set(playerId, read);
  }
}

/** A player's tendencies as rates, blended with a typical player's until enough hands are seen. */
export interface Tendencies {
  vpip: number;
  pfr: number;
  /** Share of their post-flop actions (bets, raises, calls) that are bets or raises. */
  aggression: number;
  /** How often they fold after the flop instead of calling. */
  foldToBet: number;
}

const TYPICAL: Tendencies = { vpip: 0.3, pfr: 0.15, aggression: 0.4, foldToBet: 0.45 };
/** Hands before a read counts as much as the typical-player prior. */
const PRIOR_HANDS = 12;
const PRIOR_ACTIONS = 10;

export function tendencies(read: PlayerRead | undefined): Tendencies {
  if (!read) return TYPICAL;
  const blend = (count: number, total: number, prior: number, weight: number) => (count + prior * weight) / (total + weight);
  return {
    vpip: blend(read.vpip, read.hands, TYPICAL.vpip, PRIOR_HANDS),
    pfr: blend(read.pfr, read.hands, TYPICAL.pfr, PRIOR_HANDS),
    aggression: blend(read.bets, read.bets + read.calls, TYPICAL.aggression, PRIOR_ACTIONS),
    foldToBet: blend(read.folds, read.folds + read.calls, TYPICAL.foldToBet, PRIOR_ACTIONS),
  };
}
