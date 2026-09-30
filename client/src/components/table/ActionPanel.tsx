import type { ActionType, GameView } from '@poker/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { request } from '../../socket/connection';
import { notifyError } from '../../state/toasts';
import { formatChips, SHORTCUT_KEYS, shortcutAction, sizingPresets } from '../../table/model';
import { cx } from '../../lib/cx';
import room from '../../styles/cardRoom.module.css';
import styles from './ActionPanel.module.css';

/** The viewer is out of chips (R-10.1). With rebuys on they can buy back in for `rebuyFor` chips; null when rebuys are off. */
export interface OutOfChips {
  rebuyFor: number | null;
}

interface Props {
  game: GameView | null;
  /** One line about what is happening when it isn't the viewer's turn. */
  status: string;
  /** Seconds left on the viewer's turn, shown once time gets short. */
  secondsLeft: number | null;
  /** Set while the viewer is busted; replaces the idle controls with the rebuy prompt. */
  outOfChips: OutOfChips | null;
}

/**
 * The viewer's controls. Every button and bound comes from the server's `legalActions`; the panel
 * only sends intents (with the handId/seq it was drawn from) and locks itself until the next snapshot.
 */
export function ActionPanel({ game, status, secondsLeft, outOfChips }: Props) {
  const legal = game?.legalActions ?? null;
  if (outOfChips && !legal) return <OutOfChipsPanel rebuyFor={outOfChips.rebuyFor} />;
  if (!game || !legal) {
    return (
      <section className={cx(styles.panel, styles.idle)} aria-label="Your actions">
        <p className={styles.status} role="status">
          {status}
        </p>
        {game && <IdleControls />}
      </section>
    );
  }
  // Keyed by seq: a new snapshot of the hand resets the amount, the busy state and any error.
  return <Turn key={`${game.handId}:${game.seq}`} game={game} secondsLeft={secondsLeft} />;
}

function Turn({ game, secondsLeft }: { game: GameView; secondsLeft: number | null }) {
  const legal = game.legalActions!;
  const me = game.players.find((p) => p.seat === game.toActSeat);
  const presets = sizingPresets(game, legal, me?.committed ?? 0);
  const canSize = legal.canBet || legal.canRaise;
  const fixed = legal.minTo === legal.maxTo;
  const [amount, setAmount] = useState(presets.min);
  const [draft, setDraft] = useState(String(presets.min));
  const [busy, setBusy] = useState(false);

  const clamp = (n: number) => Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(n)));
  const choose = (n: number) => {
    const v = clamp(n);
    setAmount(v);
    setDraft(String(v));
  };

  async function send(type: ActionType, to?: number) {
    setBusy(true);
    const res = await request('game:action', { handId: game.handId, seq: game.seq, type, ...(to === undefined ? {} : { amount: to }) });
    if (!res.ok) {
      setBusy(false);
      notifyError(res.error === 'STALE_ACTION' ? 'The table moved on before that arrived. Try again.' : res.message);
    }
    // On success the next snapshot re-keys this component.
  }

  // F, C and R press the matching legal button (re-subscribed each render, so it sees the chosen amount).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (busy || e.repeat || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const type = shortcutAction(e.key, legal);
      if (!type) return;
      e.preventDefault();
      void send(type, type === 'bet' || type === 'raise' ? amount : undefined);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const allIn = amount === legal.maxTo;
  const sizeVerb = legal.canBet ? 'Bet' : 'Raise to';
  const callAllIn = legal.canCall && me !== undefined && legal.callAmount >= me.stack;

  const onDraftCommit = (e?: FormEvent) => {
    e?.preventDefault();
    const n = Number(draft.replace(/[^\d]/g, ''));
    choose(Number.isFinite(n) && n > 0 ? n : presets.min);
  };

  return (
    <section className={styles.panel} aria-label="Your actions">
      <p className={styles.status} role="status">
        <b>Your turn.</b> {legal.canCall ? `${formatChips(legal.callAmount)} to call.` : 'You can check.'}
        {secondsLeft !== null && secondsLeft <= 10 && <span className={styles.hurry}> {secondsLeft}s left</span>}
      </p>
      <div className={styles.row}>
        <button
          type="button"
          className={cx(room.act, styles.fold)}
          disabled={busy}
          aria-keyshortcuts={SHORTCUT_KEYS.fold}
          onClick={() => void send('fold')}
        >
          Fold
          <Key k={SHORTCUT_KEYS.fold} />
        </button>
        {legal.canCheck ? (
          <button type="button" className={room.act} disabled={busy} aria-keyshortcuts={SHORTCUT_KEYS.call} onClick={() => void send('check')}>
            Check
            <Key k={SHORTCUT_KEYS.call} />
          </button>
        ) : (
          <button
            type="button"
            className={room.act}
            disabled={busy || !legal.canCall}
            aria-keyshortcuts={SHORTCUT_KEYS.call}
            onClick={() => void send('call')}
          >
            {callAllIn ? 'Call all-in' : 'Call'}
            <small>{formatChips(legal.callAmount)}</small>
            <Key k={SHORTCUT_KEYS.call} />
          </button>
        )}
        <button
          type="button"
          className={cx(room.act, room.primary)}
          disabled={busy || !canSize}
          aria-keyshortcuts={canSize ? SHORTCUT_KEYS.raise : undefined}
          onClick={() => void send(legal.canBet ? 'bet' : 'raise', amount)}
        >
          {!canSize ? 'Raise' : allIn ? 'All-in' : legal.canBet ? 'Bet' : 'Raise'}
          {canSize && <small>{allIn ? formatChips(amount) : `${sizeVerb === 'Bet' ? '' : 'to '}${formatChips(amount)}`}</small>}
          {canSize && <Key k={SHORTCUT_KEYS.raise} />}
        </button>
      </div>

      {canSize && !fixed && (
        <>
          <form className={styles.sizer} onSubmit={onDraftCommit}>
            <input
              type="range"
              min={legal.minTo}
              max={legal.maxTo}
              step={1}
              value={amount}
              disabled={busy}
              aria-label={legal.canBet ? 'Bet amount' : 'Raise to'}
              onChange={(e) => choose(Number(e.target.value))}
            />
            <input
              className={styles.amount}
              type="text"
              inputMode="numeric"
              value={draft}
              disabled={busy}
              aria-label={legal.canBet ? 'Bet amount' : 'Raise to amount'}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => onDraftCommit()}
            />
          </form>
          <div className={styles.presets}>
            <button type="button" disabled={busy} onClick={() => choose(presets.min)}>
              Min
            </button>
            <button type="button" disabled={busy} onClick={() => choose(presets.half)}>
              ½ pot
            </button>
            <button type="button" disabled={busy} onClick={() => choose(presets.pot)}>
              Pot
            </button>
            <button type="button" disabled={busy} onClick={() => choose(presets.max)}>
              All-in
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** The key that presses this button, in its top corner. */
function Key({ k }: { k: string }) {
  return (
    <kbd className={styles.key} aria-hidden="true">
      {k}
    </kbd>
  );
}

/** Typing into a field (the amount box) never triggers a shortcut; the range slider and buttons do. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== 'range' && target.type !== 'checkbox';
}

/** Busted: rebuy (the one thing to do now, so it is lit) or, with rebuys off, watch. */
function OutOfChipsPanel({ rebuyFor }: { rebuyFor: number | null }) {
  const [busy, setBusy] = useState(false);

  async function rebuy() {
    setBusy(true);
    const res = await request('game:rebuy', {});
    // On success the next snapshot has chips on the seat and this panel goes away.
    if (!res.ok) {
      setBusy(false);
      notifyError(res.message);
    }
  }

  if (rebuyFor === null) {
    return (
      <section className={cx(styles.panel, styles.idle)} aria-label="Your actions">
        <p className={styles.status} role="status">
          <b>You're out of chips.</b> Rebuys are off, so you can watch until the game ends, or leave the table.
        </p>
      </section>
    );
  }
  return (
    <section className={styles.panel} aria-label="Your actions">
      <p className={styles.status} role="status">
        <b>You're out of chips.</b> Rebuy to play from the next hand.
      </p>
      <button type="button" className={cx(room.act, room.primary, styles.rebuy)} disabled={busy} onClick={() => void rebuy()}>
        Rebuy for {formatChips(rebuyFor)}
      </button>
    </section>
  );
}

/** Greyed-out controls, so the panel keeps its shape between turns. */
function IdleControls() {
  return (
    <div aria-hidden="true">
      <div className={styles.row}>
        <span className={cx(room.act, styles.fold, styles.ghostAct)}>Fold</span>
        <span className={cx(room.act, styles.ghostAct)}>Call</span>
        <span className={cx(room.act, room.primary, styles.ghostAct, styles.ghostPrimary)}>Raise</span>
      </div>
      <div className={cx(styles.sizer, styles.ghostRow)}>
        <span className={styles.track} />
        <span className={styles.amount} />
      </div>
      <div className={cx(styles.presets, styles.ghostRow)}>
        <span>Min</span>
        <span>½ pot</span>
        <span>Pot</span>
        <span>All-in</span>
      </div>
    </div>
  );
}
