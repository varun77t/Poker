import { BOT_LEVELS, type BotLevel } from '@poker/shared';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { cx } from '../../lib/cx';
import { BOT_LEVEL_TEXT } from '../../table/model';
import { request } from '../../socket/connection';
import room from '../../styles/cardRoom.module.css';
import styles from './BotControls.module.css';

/** Closes a floating panel on Escape or a press outside it. */
function useDismiss(panel: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current();
    };
    const onPress = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) latest.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open, panel]);
}

/**
 * The host's view of an open seat at the table: the dashed "Open seat" pill becomes a button that
 * opens a small panel to seat a bot there. The server seats it; the next snapshot replaces this.
 */
export function AddBotSeat({ seat }: { seat: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setError(null);
    trigger.current?.focus();
  };
  useDismiss(panel, open, close);

  async function add(level: BotLevel) {
    setBusy(true);
    setError(null);
    const res = await request('room:addBot', { level, seat });
    setBusy(false);
    if (!res.ok) setError(res.message);
  }

  return (
    <div className={styles.anchor} ref={panel}>
      <button
        ref={trigger}
        type="button"
        className={styles.openSeat}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span>Open seat</span>
        <span className={styles.openHint}>Add a bot</span>
      </button>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Add a bot" data-bot-panel>
          <div className={styles.head}>
            <span className={styles.title}>Add a bot</span>
            <button type="button" className={cx(room.ghost, styles.small)} onClick={close}>
              Cancel
            </button>
          </div>
          <div className={styles.levels}>
            {BOT_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={room.act}
                disabled={busy}
                autoFocus={level === 'normal'}
                onClick={() => void add(level)}
              >
                {BOT_LEVEL_TEXT[level].name}
                <small>{BOT_LEVEL_TEXT[level].blurb}</small>
              </button>
            ))}
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface RemoveBotProps {
  seat: number;
  name: string;
  /** The bot holds cards in the hand being played, so removing it folds them. */
  inHand: boolean;
}

/**
 * The host's Remove control on a bot's plaque: a small tab that shows while the seat is hovered or
 * focused, then an inline confirm under the plaque, like Leave and End game in the top bar.
 */
export function RemoveBot({ seat, name, inHand }: RemoveBotProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => {
    setConfirming(false);
    setError(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  useDismiss(panel, confirming, close);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await request('room:removeBot', { seat });
    setBusy(false);
    // On success the next snapshot takes the bot away (or marks it as leaving after this hand).
    if (!res.ok) setError(res.message);
  }

  if (!confirming) {
    return (
      <button ref={trigger} type="button" className={styles.removeTab} onClick={() => setConfirming(true)} aria-label={`Remove ${name}`}>
        Remove
      </button>
    );
  }
  return (
    <div ref={panel} className={cx(styles.panel, styles.confirm)} role="dialog" aria-label={`Remove ${name}?`} data-bot-panel>
      <p className={styles.title}>Remove {name}?</p>
      {inHand && <p className={styles.note}>It folds this hand.</p>}
      <div className={styles.confirmRow}>
        <button type="button" className={room.ghost} onClick={close} disabled={busy} autoFocus>
          Keep
        </button>
        <button type="button" className={room.danger} onClick={() => void remove()} disabled={busy}>
          Remove
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
