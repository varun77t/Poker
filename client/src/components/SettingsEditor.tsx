import type { RoomSettings } from '@poker/shared';
import { useId } from 'react';
import { request } from '../socket/connection';
import { useAppState } from '../state/store';
import { Button } from './Button';
import { SettingsForm } from './SettingsForm';
import styles from './SettingsEditor.module.css';

/** The host edits the room's settings in the side column, in place of what it usually shows. */
export function SettingsEditor({ settings, title, hint, onDone }: { settings: RoomSettings; title: string; hint?: string; onDone: () => void }) {
  const titleId = useId();
  const connected = useAppState((s) => s.connection === 'connected');

  async function save(next: RoomSettings): Promise<string | null> {
    const res = await request('room:updateSettings', { settings: next });
    if (!res.ok) return res.message;
    onDone();
    return null;
  }

  return (
    <section className={styles.editor} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.form}>
        <SettingsForm
          initial={settings}
          submitLabel="Save settings"
          submitDisabled={!connected}
          onSubmit={save}
          autoFocus
          footer={
            <Button variant="ghost" fullWidth onClick={onDone}>
              Cancel
            </Button>
          }
        />
      </div>
    </section>
  );
}
