import { chipColors } from '../../table/model';
import styles from './ChipStack.module.css';

/** A small stack of flat striped chips; the colours hint at size. Decorative: amounts are always written beside it. */
export function ChipStack({ amount }: { amount: number }) {
  return (
    <span className={styles.stack} aria-hidden="true">
      {chipColors(amount).map((colour, i) => (
        <i key={i} className={`${styles.chip} ${styles[colour]}`} style={{ top: `${-i * 4}px` }} />
      ))}
    </span>
  );
}
