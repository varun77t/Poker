import type { ReactNode } from 'react';
import styles from './RoomBar.module.css';

interface Props {
  code: string;
  /** Room facts after the code (hand number, blinds, "Game over"). */
  meta?: ReactNode;
  /** Controls on the right (End game, Leave). */
  actions?: ReactNode;
}

/** The 52px strip above the in-game screens: name, room code, facts, and the room's controls. */
export function RoomBar({ code, meta, actions }: Props) {
  return (
    <header className={styles.bar}>
      <span className={styles.mark}>Private Hold'em</span>
      <span className={styles.code} aria-label={`Room code ${code}`}>
        {code}
      </span>
      {meta}
      <span className={styles.spacer} />
      {actions}
    </header>
  );
}

export function BarMeta({ label, value, testId }: { label: string; value?: ReactNode; testId?: string }) {
  return (
    <span className={styles.meta} data-testid={testId}>
      {label}
      {value !== undefined && <> <b>{value}</b></>}
    </span>
  );
}

/** An inline "are you sure" in the bar: the question, a way back, and the confirming action. */
export function BarConfirm({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className={styles.confirm} role="group" aria-label={label}>
      {children}
    </span>
  );
}

/** A status pill in the bar that everyone sees (e.g. the game ends after this hand). */
export function BarNotice({ children }: { children: ReactNode }) {
  return (
    <span className={styles.notice} role="status">
      {children}
    </span>
  );
}
