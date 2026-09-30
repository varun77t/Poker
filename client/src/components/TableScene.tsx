import type { Card } from '@poker/shared';
import type { CSSProperties } from 'react';
import { ChipStack } from './table/ChipStack';
import { PlayingCard } from './table/PlayingCard';
import styles from './TableScene.module.css';

const FLOP: Card[] = ['Qh', 'Js', 'Ts'];
const HOLE: Card[] = ['As', 'Ks'];

/**
 * The home screen's picture: a corner of the real table, drawn with the table's own cards and chips,
 * with a hand being dealt. Decorative; everything it shows is sample cards, not a game.
 */
export function TableScene() {
  const order = (i: number) => ({ '--i': i }) as CSSProperties;
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.table}>
        <div className={styles.felt}>
          <div className={styles.pot}>
            <ChipStack amount={240} />
            <span className={styles.potLabel}>
              <span>Pot</span>240
            </span>
          </div>
          <div className={styles.board}>
            {FLOP.map((card, i) => (
              <div key={card} className={styles.dealt} style={order(i)}>
                <PlayingCard card={card} className={styles.boardCard} />
              </div>
            ))}
            <span className={styles.slot} />
            <span className={styles.slot} />
          </div>
          <span className={styles.dealer}>D</span>
        </div>
      </div>
      <div className={styles.hole}>
        {HOLE.map((card, i) => (
          <div key={card} className={styles.dealt} style={order(3 + i)}>
            <PlayingCard card={card} className={styles.holeCard} />
          </div>
        ))}
      </div>
    </div>
  );
}
