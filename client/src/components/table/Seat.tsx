import type { Card } from '@poker/shared';
import type { CSSProperties } from 'react';
import { formatChips, SLOTS, type SeatModel, type SeatTag } from '../../table/model';
import { cx } from '../../lib/cx';
import { PlayingCard } from './PlayingCard';
import styles from './Seat.module.css';

const TAG_TEXT: Record<Exclude<SeatTag['kind'], 'action' | 'blind'>, string> = {
  allIn: 'All-in',
  away: 'Away',
  left: 'Left',
  nextHand: 'Next hand',
  busted: 'Out of chips',
};

function tagText(tag: SeatTag): string {
  return tag.kind === 'action' || tag.kind === 'blind' ? tag.text : TAG_TEXT[tag.kind];
}

export interface TurnClock {
  /** Total length of a turn and how much of it has already passed, in ms. */
  totalMs: number;
  elapsedMs: number;
  /** Changes whenever a new turn starts, so the ring restarts. */
  key: string;
}

interface Props {
  model: SeatModel;
  /** The finished hand's winning cards; everything else shown dims while the result is up. */
  highlight: Set<Card> | null;
  clock: TurnClock | null;
}

export function Seat({ model, highlight, clock }: Props) {
  const { seat, slot, view, player, isYou, isTurn, isWinner, folded, sittingOut, tag, stack } = model;
  const [x, y] = SLOTS[slot]?.seat ?? [0.5, 0.5];
  const tone = (card: Card) => (highlight ? (highlight.has(card) ? 'lift' : 'dim') : undefined);

  let cards: (Card | null)[] = [];
  if (player && isYou && player.holeCards) cards = player.holeCards;
  else if (player && !folded) cards = player.holeCards ?? [null, null];

  const describe = [
    isYou ? `${view.displayName} (you)` : view.displayName,
    `${formatChips(stack)} chips`,
    tag && tagText(tag),
    isTurn && 'to act',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      className={cx(styles.seat, isYou && styles.you, folded && styles.folded, isTurn && styles.turn, isWinner && styles.winner, sittingOut && styles.out)}
      data-winner={isWinner || undefined}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` } as CSSProperties}
    >
      <div className={styles.hole}>
        {cards.map((card, i) => (
          <PlayingCard
            key={i}
            card={card}
            anchor={`hole-${seat}-${i}`}
            tone={card ? tone(card) : undefined}
            className={cx(isYou ? styles.mine : styles.theirs, isYou && folded && styles.foldedMine)}
          />
        ))}
      </div>
      <div className={styles.plaque} data-anchor={`plaque-${seat}`} aria-label={describe} role="group">
        <span className={styles.avatar} aria-hidden="true">
          {([...view.displayName][0] ?? '?').toLocaleUpperCase()}
          {clock && <TurnRing clock={clock} />}
        </span>
        <span className={styles.who} aria-hidden="true">
          <span className={styles.name}>{isYou ? 'You' : view.displayName}</span>
          <span className={styles.stack}>{formatChips(stack)}</span>
        </span>
        {tag && (
          <span className={cx(styles.tag, (tag.kind === 'away' || tag.kind === 'left' || tag.kind === 'busted') && styles.tagQuiet)} aria-hidden="true">
            {tagText(tag)}
          </span>
        )}
      </div>
    </div>
  );
}

/** The brass ring around the avatar that runs down as the turn's time passes. */
function TurnRing({ clock }: { clock: TurnClock }) {
  return (
    <svg className={styles.ring} viewBox="0 0 48 48" key={clock.key}>
      <circle
        cx="24"
        cy="24"
        r="22"
        style={{ animationDuration: `${clock.totalMs}ms`, animationDelay: `${-clock.elapsedMs}ms` }}
      />
    </svg>
  );
}

export function EmptySeat({ slot }: { slot: number }) {
  const [x, y] = SLOTS[slot]?.seat ?? [0.5, 0.5];
  return (
    <div className={cx(styles.seat, styles.empty)} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <div className={styles.emptyPlaque}>Open seat</div>
    </div>
  );
}
