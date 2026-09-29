import type { ActionType, GameView } from '@poker/shared';
import { useState, type FormEvent } from 'react';
import { request } from '../../socket/connection';
import { formatChips, sizingPresets } from '../../table/model';
import { cx } from '../../lib/cx';
import styles from './ActionPanel.module.css';

interface Props {
  game: GameView | null;
  /** One line about what is happening when it isn't the viewer's turn. */
  status: string;
  /** Seconds left on the viewer's turn, shown once time gets short. */
  secondsLeft: number | null;
}

/**
 * The viewer's controls. Every button and bound comes from the server's `legalActions`; the panel
 * only sends intents (with the handId/seq it was drawn from) and locks itself until the next snapshot.
 */
export function ActionPanel({ game, status, secondsLeft }: Props) {
  const legal = game?.legalActions ?? null;
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
  const [error, setError] = useState<string | null>(null);

  const clamp = (n: number) => Math.min(legal.maxTo, Math.max(legal.minTo, Math.round(n)));
  const choose = (n: number) => {
    const v = clamp(n);
    setAmount(v);
    setDraft(String(v));
  };

  async function send(type: ActionType, to?: number) {
    setBusy(true);
    setError(null);
    const res = await request('game:action', { handId: game.handId, seq: game.seq, type, ...(to === undefined ? {} : { amount: to }) });
    if (!res.ok) {
      setBusy(false);
      setError(res.error === 'STALE_ACTION' ? 'The table moved on before that arrived. Try again.' : res.message);
    }
    // On success the next snapshot re-keys this component.
  }

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
        <button type="button" className={cx(styles.act, styles.fold)} disabled={busy} onClick={() => void send('fold')}>
          Fold
        </button>
        {legal.canCheck ? (
          <button type="button" className={styles.act} disabled={busy} onClick={() => void send('check')}>
            Check
          </button>
        ) : (
          <button type="button" className={styles.act} disabled={busy || !legal.canCall} onClick={() => void send('call')}>
            {callAllIn ? 'Call all-in' : 'Call'}
            <small>{formatChips(legal.callAmount)}</small>
          </button>
        )}
        <button
          type="button"
          className={cx(styles.act, styles.primary)}
          disabled={busy || !canSize}
          onClick={() => void send(legal.canBet ? 'bet' : 'raise', amount)}
        >
          {!canSize ? 'Raise' : allIn ? 'All-in' : legal.canBet ? 'Bet' : 'Raise'}
          {canSize && <small>{allIn ? formatChips(amount) : `${sizeVerb === 'Bet' ? '' : 'to '}${formatChips(amount)}`}</small>}
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
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Greyed-out controls, so the panel keeps its shape between turns. */
function IdleControls() {
  return (
    <div aria-hidden="true">
      <div className={styles.row}>
        <span className={cx(styles.act, styles.fold, styles.ghostAct)}>Fold</span>
        <span className={cx(styles.act, styles.ghostAct)}>Call</span>
        <span className={cx(styles.act, styles.primary, styles.ghostAct)}>Raise</span>
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
