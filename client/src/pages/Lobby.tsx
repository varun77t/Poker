import { MAX_SEATS, MIN_PLAYERS_TO_START, type SeatView, type TableSnapshot } from '@poker/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Brand, Card, Notice, Page } from '../components/Layout';
import { request } from '../socket/connection';
import { setState } from '../state/store';
import styles from './Lobby.module.css';

const isSeat = (s: SeatView | null): s is SeatView => s !== null;

function initial(name: string): string {
  return ([...name][0] ?? '?').toLocaleUpperCase();
}

export function Lobby({ snapshot }: { snapshot: TableSnapshot }) {
  const { room } = snapshot;
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'start' | 'leave' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seated = room.seats.filter(isSeat);
  const isHost = room.hostId === room.youId;
  const hostName = seated.find((s) => s.playerId === room.hostId)?.displayName ?? 'the host';
  const enoughPlayers = seated.length >= MIN_PLAYERS_TO_START;
  const { settings } = room;

  async function start() {
    setBusy('start');
    setError(null);
    const res = await request('game:start', {});
    setBusy(null);
    if (!res.ok) setError(res.message);
  }

  async function leave() {
    setBusy('leave');
    setError(null);
    const res = await request('room:leave', {});
    setBusy(null);
    if (!res.ok && res.error !== 'NOT_IN_ROOM') {
      setError(res.message);
      return;
    }
    navigate('/');
    setState({ snapshot: null });
  }

  return (
    <Page>
      <Brand />

      <Card>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Room code</p>
            <p className={styles.code} data-testid="room-code">
              {room.code}
            </p>
          </div>
          <InviteLink code={room.code} />
        </div>

        <ul className={styles.settings} aria-label="Room settings">
          <li>
            Blinds {settings.smallBlind.toLocaleString()}/{settings.bigBlind.toLocaleString()}
          </li>
          <li>{settings.startingStack.toLocaleString()} chips</li>
          <li>{settings.turnSeconds}s per turn</li>
          <li>Rebuys {settings.rebuys ? 'on' : 'off'}</li>
        </ul>
      </Card>

      <Card>
        <div className={styles.playersHeader}>
          <h2 className={styles.playersTitle}>Players</h2>
          <span className={styles.count} data-testid="player-count">
            {seated.length}/{MAX_SEATS}
          </span>
        </div>

        <ol className={styles.seats}>
          {room.seats.map((seat, index) =>
            seat ? (
              <li key={seat.playerId} className={styles.seat} data-connected={seat.connected}>
                <span className={styles.avatar} aria-hidden="true">
                  {initial(seat.displayName)}
                </span>
                <span className={styles.name}>{seat.displayName}</span>
                <span className={styles.badges}>
                  {seat.playerId === room.hostId && <span className={styles.hostBadge}>Host</span>}
                  {seat.playerId === room.youId && <span className={styles.badge}>You</span>}
                  {seat.waitingForNextHand && <span className={styles.badge}>Next hand</span>}
                  {!seat.connected && <span className={styles.offline}>Reconnecting…</span>}
                </span>
              </li>
            ) : (
              <li key={`open-${index}`} className={styles.openSeat}>
                Open seat
              </li>
            ),
          )}
        </ol>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      <div className={styles.actions}>
        {room.status === 'playing' ? (
          <Notice>The game has started. The poker table arrives in the next update.</Notice>
        ) : isHost ? (
          <>
            <Button fullWidth busy={busy === 'start'} disabled={!enoughPlayers || busy !== null} onClick={() => void start()}>
              Start game
            </Button>
            {!enoughPlayers && <p className={styles.hint}>Invite at least one more player to start.</p>}
          </>
        ) : (
          <p className={styles.waiting}>Waiting for {hostName} to start the game…</p>
        )}
        <Button variant="ghost" fullWidth busy={busy === 'leave'} disabled={busy !== null} onClick={() => void leave()}>
          Leave room
        </Button>
      </div>
    </Page>
  );
}

function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const link = `${window.location.origin}/room/${code}`;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('yes');
    } catch {
      // Clipboard needs a secure context (https or localhost); fall back to showing the link.
      setCopied('failed');
    }
  }

  return (
    <div className={styles.invite}>
      <Button variant="secondary" onClick={() => void copy()}>
        {copied === 'yes' ? 'Link copied' : 'Copy invite link'}
      </Button>
      {copied === 'failed' && (
        <input
          className={styles.linkFallback}
          readOnly
          value={link}
          aria-label="Invite link"
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
        />
      )}
    </div>
  );
}
