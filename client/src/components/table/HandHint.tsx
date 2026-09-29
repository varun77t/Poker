import type { HandHint } from '@poker/shared';
import type { CSSProperties } from 'react';
import { cx } from '../../lib/cx';
import { DRAW_TARGET, HAND_LADDER, hintNotes } from '../../table/model';
import styles from './HandHint.module.css';

/**
 * What your cards make right now, docked bottom-left opposite the action panel. The server works the
 * hand out (GameView.yourHand) from your own cards and the board; this only shows it: the hand's
 * name, any draws, and the nine kinds of hand with yours lit, so you can see what beats what.
 */
export function HandHintPlate({ hint }: { hint: HandHint }) {
  const rung = HAND_LADDER.findIndex((r) => r.category === hint.category);
  const drawingTo = new Set(hint.draws.map((d) => DRAW_TARGET[d]));
  const notes = hintNotes(hint);
  // "Full House, Kings over Sevens": the kind of hand leads, its detail sits under it.
  const [kind, detail] = hint.label.split(', ');

  return (
    <aside className={styles.plate} aria-label="Your hand">
      <p className={styles.hand} aria-live="polite">
        {kind}
        {detail && (
          <span className={styles.detail}>
            <span className={styles.hidden}>, </span>
            {detail}
          </span>
        )}
      </p>
      {notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
      <div className={styles.ladder} style={{ '--rung': rung } as CSSProperties}>
        <span className={styles.band} aria-hidden="true" />
        <ol aria-label="Hand rankings, best first">
          {HAND_LADDER.map(({ category, name }) => {
          const lit = category === hint.category;
          const draw = drawingTo.has(category);
          return (
              <li key={category} className={cx(lit && styles.lit, draw && styles.draw)} aria-current={lit ? 'true' : undefined}>
                {name}
                {draw && <span className={styles.drawMark}>draw</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
