import type { Card } from '@poker/shared';
import { cx } from '../../lib/cx';
import styles from './PlayingCard.module.css';

const RANK_NAMES: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: '10' };
const SUIT_NAMES: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

function cardName(card: Card): string {
  const rank = card.charAt(0);
  return `${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[card.charAt(1)] ?? ''}`;
}

interface Props {
  /** null draws the back of a card. */
  card: Card | null;
  /** Motion anchor name (see table/motionPlan.ts). */
  anchor?: string;
  /** Result emphasis: the winning five lift, everything else dims. */
  tone?: 'lift' | 'dim';
  className?: string;
}

/** A playing card drawn in CSS and SVG; its width comes from the parent (`className`). */
export function PlayingCard({ card, anchor, tone, className }: Props) {
  if (!card) {
    return (
      <div className={cx(styles.card, styles.back, className)} data-anchor={anchor} role="img" aria-label="Face-down card">
        <span className={styles.pattern} />
      </div>
    );
  }
  const suit = card.charAt(1);
  const red = suit === 'h' || suit === 'd';
  return (
    <div
      className={cx(styles.card, styles.face, red && styles.red, tone && styles[tone], className)}
      data-anchor={anchor}
      role="img"
      aria-label={cardName(card)}
    >
      <span className={styles.inner} aria-hidden="true">
        <span className={styles.rank}>{card.charAt(0) === 'T' ? '10' : card.charAt(0)}</span>
        <svg className={styles.small} viewBox="0 0 100 100">
          <use href={`#suit-${suit}`} />
        </svg>
        <svg className={styles.big} viewBox="0 0 100 100">
          <use href={`#suit-${suit}`} />
        </svg>
      </span>
    </div>
  );
}

/** Suit shapes, defined once per page and referenced by every card. */
export function SuitSymbols() {
  return (
    <svg width="0" height="0" className={styles.sprite} aria-hidden="true" focusable="false">
      <symbol id="suit-s" viewBox="0 0 100 100">
        <path d="M50 4C38 22 8 38 8 62c0 14 11 23 23 23 7 0 13-3 16-8-1 8-4 14-10 19h26c-6-5-9-11-10-19 3 5 9 8 16 8 12 0 23-9 23-23C92 38 62 22 50 4z" />
      </symbol>
      <symbol id="suit-h" viewBox="0 0 100 100">
        <path d="M50 92C34 76 6 58 6 34 6 18 18 8 31 8c9 0 16 5 19 12 3-7 10-12 19-12 13 0 25 10 25 26 0 24-28 42-44 58z" />
      </symbol>
      <symbol id="suit-d" viewBox="0 0 100 100">
        <path d="M50 4 88 50 50 96 12 50z" />
      </symbol>
      <symbol id="suit-c" viewBox="0 0 100 100">
        <path d="M50 6a19 19 0 0 0-17 28 19 19 0 1 0 7 33c-1 10-5 17-11 23h42c-6-6-10-13-11-23a19 19 0 1 0 7-33A19 19 0 0 0 50 6z" />
      </symbol>
    </svg>
  );
}
