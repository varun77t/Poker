import type { RoomSettings } from '@poker/shared';
import { formatChips } from '../table/model';
import styles from './SettingsFacts.module.css';

/** The room's settings as one sentence, values in ink; a value the host just changed is marked in paper. */
export function SettingsFacts({ settings, changed, lead }: { settings: RoomSettings; changed: (keyof RoomSettings)[]; lead: string }) {
  const mark = (...keys: (keyof RoomSettings)[]) => (changed.some((k) => keys.includes(k)) ? true : undefined);
  return (
    <p className={styles.facts}>
      {lead} <b data-changed={mark('startingStack')}>{formatChips(settings.startingStack)}</b> chips, blinds{' '}
      <b data-changed={mark('smallBlind', 'bigBlind')}>
        {formatChips(settings.smallBlind)}/{formatChips(settings.bigBlind)}
      </b>
      , <b data-changed={mark('turnSeconds')}>{settings.turnSeconds}s</b> turns, rebuys{' '}
      <b data-changed={mark('rebuys')}>{settings.rebuys ? 'on' : 'off'}</b>.
    </p>
  );
}
