import { DEFAULT_ROOM_SETTINGS, RoomSettingsSchema, SETTINGS_BOUNDS, type RoomSettings } from '@poker/shared';
import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Brand, Card, Notice, Page } from '../components/Layout';
import { TextField } from '../components/TextField';
import { request } from '../socket/connection';
import { useAppState } from '../state/store';
import styles from './CreateRoom.module.css';

const TURN_OPTIONS = [15, 20, 30, 45, 60, 90, 120] as const;

type NumericField = 'startingStack' | 'smallBlind' | 'bigBlind';
type FieldErrors = Partial<Record<keyof RoomSettings, string>>;

export function CreateRoom() {
  const session = useAppState((s) => s.session);
  if (!session) return <Navigate to="/" replace />;
  return <CreateRoomForm />;
}

function CreateRoomForm() {
  const navigate = useNavigate();
  const connection = useAppState((s) => s.connection);
  const timerId = useId();

  const [numbers, setNumbers] = useState<Record<NumericField, string>>({
    startingStack: String(DEFAULT_ROOM_SETTINGS.startingStack),
    smallBlind: String(DEFAULT_ROOM_SETTINGS.smallBlind),
    bigBlind: String(DEFAULT_ROOM_SETTINGS.bigBlind),
  });
  const [turnSeconds, setTurnSeconds] = useState<number>(DEFAULT_ROOM_SETTINGS.turnSeconds);
  const [rebuys, setRebuys] = useState<boolean>(DEFAULT_ROOM_SETTINGS.rebuys);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connected = connection === 'connected';

  const numberField = (field: NumericField, label: string, hint?: string) => (
    <TextField
      label={label}
      type="number"
      inputMode="numeric"
      min={1}
      step={1}
      value={numbers[field]}
      onChange={(e) => {
        setNumbers((n) => ({ ...n, [field]: e.target.value }));
        setErrors((errs) => ({ ...errs, [field]: undefined }));
      }}
      error={errors[field]}
      hint={hint}
    />
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const toInt = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));
    const parsed = RoomSettingsSchema.safeParse({
      startingStack: toInt(numbers.startingStack),
      smallBlind: toInt(numbers.smallBlind),
      bigBlind: toInt(numbers.bigBlind),
      turnSeconds,
      rebuys,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof RoomSettings | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setBusy(true);
    const res = await request('room:create', { settings: parsed.data });
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    navigate(`/room/${res.data.code}`, { replace: true });
  }

  return (
    <Page>
      <Brand />
      <Card>
        <div>
          <h1 className={styles.heading}>New room</h1>
          <p className={styles.sub}>These settings are fixed once the room is created.</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {numberField(
            'startingStack',
            'Starting chips',
            `${SETTINGS_BOUNDS.startingStack.min.toLocaleString()}–${SETTINGS_BOUNDS.startingStack.max.toLocaleString()}`,
          )}

          <div className={styles.pair}>
            {numberField('smallBlind', 'Small blind')}
            {numberField('bigBlind', 'Big blind')}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={timerId}>
              Time per turn
            </label>
            <select
              id={timerId}
              className={styles.select}
              value={turnSeconds}
              onChange={(e) => setTurnSeconds(Number(e.target.value))}
            >
              {TURN_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
          </div>

          <label className={styles.toggle}>
            <input type="checkbox" checked={rebuys} onChange={(e) => setRebuys(e.target.checked)} />
            <span>
              <span className={styles.toggleTitle}>Allow rebuys</span>
              <span className={styles.toggleHint}>Players who run out of chips can buy back in between hands.</span>
            </span>
          </label>

          {formError && <Notice tone="error">{formError}</Notice>}

          <Button type="submit" fullWidth busy={busy} disabled={!connected}>
            {connected ? 'Create room' : 'Connecting…'}
          </Button>
          <Link to="/" className={styles.back}>
            Back
          </Link>
        </form>
      </Card>
    </Page>
  );
}
