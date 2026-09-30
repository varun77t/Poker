import { RoomSettingsSchema, SETTINGS_BOUNDS, type RoomSettings } from '@poker/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './Button';
import { Notice } from './Layout';
import { TextField } from './TextField';
import styles from './SettingsForm.module.css';

const TURN_OPTIONS = [15, 20, 30, 45, 60, 90, 120] as const;

type NumericField = 'startingStack' | 'smallBlind' | 'bigBlind';
type FieldErrors = Partial<Record<keyof RoomSettings, string>>;

interface SettingsFormProps {
  initial: RoomSettings;
  submitLabel: string;
  submitDisabled?: boolean;
  /** Sends the validated settings. Resolves to an error message to show, or null on success. */
  onSubmit: (settings: RoomSettings) => Promise<string | null>;
  /** Secondary actions under the submit button (a Back link, a Cancel button). */
  footer?: ReactNode;
  autoFocus?: boolean;
}

/** Room settings form, used to create a room and to edit it from the lobby. Validates with the server's schema. */
export function SettingsForm({ initial, submitLabel, submitDisabled, onSubmit, footer, autoFocus }: SettingsFormProps) {
  const timerId = useId();
  const [numbers, setNumbers] = useState<Record<NumericField, string>>({
    startingStack: String(initial.startingStack),
    smallBlind: String(initial.smallBlind),
    bigBlind: String(initial.bigBlind),
  });
  const [turnSeconds, setTurnSeconds] = useState(initial.turnSeconds);
  const [rebuys, setRebuys] = useState(initial.rebuys);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep a non-standard current value (e.g. from an older client) selectable.
  const turnOptions = TURN_OPTIONS.some((s) => s === initial.turnSeconds)
    ? TURN_OPTIONS
    : [...TURN_OPTIONS, initial.turnSeconds].sort((a, b) => a - b);

  const numberField = (field: NumericField, label: string, hint?: string, focus?: boolean) => (
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
      autoFocus={focus}
    />
  );

  async function submit(event: FormEvent) {
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
    const error = await onSubmit(parsed.data);
    setBusy(false);
    if (error) setFormError(error);
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.pair}>
        {numberField(
          'startingStack',
          'Starting chips',
          `${SETTINGS_BOUNDS.startingStack.min.toLocaleString()} to ${SETTINGS_BOUNDS.startingStack.max.toLocaleString()}`,
          autoFocus,
        )}
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
            {turnOptions.map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.pair}>
        {numberField('smallBlind', 'Small blind')}
        {numberField('bigBlind', 'Big blind')}
      </div>

      <label className={styles.toggle}>
        <input type="checkbox" checked={rebuys} onChange={(e) => setRebuys(e.target.checked)} />
        <span>
          <span className={styles.toggleTitle}>Allow rebuys</span>
          <span className={styles.toggleHint}>Players who run out of chips can buy back in between hands.</span>
        </span>
      </label>

      {formError && <Notice tone="error">{formError}</Notice>}

      <Button type="submit" variant="primary" fullWidth busy={busy} disabled={submitDisabled}>
        {submitLabel}
      </Button>
      {footer}
    </form>
  );
}
