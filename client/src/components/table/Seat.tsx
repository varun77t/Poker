import type { Card } from '@poker/shared';
import type { CSSProperties } from 'react';
import { BOT_LEVEL_TEXT, formatChips, SLOTS, type SeatModel, type SeatTag } from '../../table/model';
import { cx } from '../../lib/cx';
import { AddBotSeat, RemoveBot } from './BotControls';
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
  /** The viewer is the host and this seat is a bot they can take off the table. */
  removable?: boolean;
}

export function Seat({ model, highlight, clock, removable = false }: Props) {
  const { seat, slot, view, player, isYou, isTurn, isWinner, folded, sittingOut, tag, stack } = model;
  const botText = view.botLevel ? `${BOT_LEVEL_TEXT[view.botLevel].name} bot` : null;
  const [x, y] = SLOTS[slot]?.seat ?? [0.5, 0.5];
  const tone = (card: Card) => (highlight ? (highlight.has(card) ? 'lift' : 'dim') : undefined);

  let cards: (Card | null)[] = [];
  if (player && isYou && player.holeCards) cards = player.holeCards;
  else if (player && !folded) cards = player.holeCards ?? [null, null];

  const describe = [
    isYou ? `${view.displayName} (you)` : view.displayName,
    botText,
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
      data-seat={seat}
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
        <span className={cx(styles.avatar, botText && styles.botAvatar)} aria-hidden="true">
          {([...view.displayName][0] ?? '?').toLocaleUpperCase()}
          {clock && <TurnRing clock={clock} />}
        </span>
        <span className={styles.who} aria-hidden="true">
          <span className={styles.nameRow}>
            <span className={styles.name}>{isYou ? 'You' : view.displayName}</span>
            {botText && <span className={styles.botMark}>{botText}</span>}
          </span>
          <span className={styles.stack}>{formatChips(stack)}</span>
        </span>
        {tag && (
          <span className={cx(styles.tag, (tag.kind === 'away' || tag.kind === 'left' || tag.kind === 'busted') && styles.tagQuiet)} aria-hidden="true">
            {tagText(tag)}
          </span>
        )}
      </div>
      {removable && <RemoveBot seat={seat} name={view.displayName} inHand={!!player && !folded && !model.view.leaving} />}
    </div>
  );
}

/** The lit ring around the avatar that runs down as the turn's time passes. */
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

/** An open seat. The host can seat a bot in it (§3.7); everyone else just sees it is free. */
export function EmptySeat({ seat, slot, canAddBot = false }: { seat: number; slot: number; canAddBot?: boolean }) {
  const [x, y] = SLOTS[slot]?.seat ?? [0.5, 0.5];
  return (
    <div className={cx(styles.seat, styles.empty)} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      {canAddBot ? <AddBotSeat seat={seat} /> : <div className={styles.emptyPlaque}>Open seat</div>}
    </div>
  );
}
