import { useSyncExternalStore } from 'react';

/** A short message about a request that failed, shown at the top of the screen for a few seconds. */
export interface Toast {
  id: number;
  message: string;
}

const SHOW_MS = 6000;
/** At most this many at once; an older one gives way to a newer one. */
const MAX_TOASTS = 3;

let toasts: readonly Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, number>();

function emit(next: readonly Toast[]): void {
  toasts = next;
  for (const listener of listeners) listener();
}

/** Shows `message` as a toast. The same message twice in a row restarts its timer rather than stacking. */
export function notifyError(message: string): void {
  const existing = toasts.find((t) => t.message === message);
  if (existing) {
    schedule(existing.id);
    return;
  }
  const toast = { id: nextId++, message };
  const kept = toasts.slice(-(MAX_TOASTS - 1));
  for (const gone of toasts.filter((t) => !kept.includes(t))) clearTimer(gone.id);
  emit([...kept, toast]);
  schedule(toast.id);
}

export function dismissToast(id: number): void {
  clearTimer(id);
  emit(toasts.filter((t) => t.id !== id));
}

function schedule(id: number): void {
  clearTimer(id);
  timers.set(id, window.setTimeout(() => dismissToast(id), SHOW_MS));
}

function clearTimer(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) window.clearTimeout(timer);
  timers.delete(id);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, () => toasts);
}
