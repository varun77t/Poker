import { changedSettingKeys, type RoomSettings } from '@poker/shared';
import { useEffect, useState } from 'react';

const CHANGED_MS = 8000;

/**
 * The settings keys the host changed since this component last saw them, held for a few seconds so
 * everyone can see what moved (state adjusted during render, not in an effect).
 */
export function useChangedSettings(settings: RoomSettings): (keyof RoomSettings)[] {
  const [seen, setSeen] = useState(settings);
  const [changed, setChanged] = useState<(keyof RoomSettings)[]>([]);
  const diff = changedSettingKeys(seen, settings);
  if (diff.length > 0) {
    setSeen(settings);
    setChanged(diff);
  }
  useEffect(() => {
    if (changed.length === 0) return;
    const timer = window.setTimeout(() => setChanged([]), CHANGED_MS);
    return () => window.clearTimeout(timer);
  }, [changed]);
  return changed;
}
