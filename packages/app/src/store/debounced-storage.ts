import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * A `PersistStorage` that coalesces writes (Phase 77 Theme C).
 *
 * zustand's default storage `JSON.stringify`s the whole persisted slice and calls
 * `localStorage.setItem` synchronously on every `set` — a range-input drag or a dashboard tile
 * drag is dozens of whole-slice serialisations a second. This keeps the latest value in memory and
 * writes it once, trailing-edge, after `ms` of quiet. The serialised `{ state, version }` envelope
 * is byte-identical to the default's, so no `version` bump and no `migrate` arm is needed: only the
 * write timing changes.
 *
 * It *replaces* a `PersistStorage` rather than wrapping one: `sharedSettingsStorage` hardcodes its
 * own `localStorage.setItem` and exposes nothing to decorate, so the two do not compose. The
 * `midnite.settings` stores keep it unchanged — their writes are rare.
 *
 * Fully synchronous, and every method is guarded on `typeof localStorage` like its sibling.
 */
const pending = new Map<string, { value: StorageValue<unknown>; timer: ReturnType<typeof setTimeout> | null }>();
let unloadWired = false;

function write(name: string): void {
  const entry = pending.get(name);
  if (!entry) return;
  pending.delete(name);
  if (entry.timer !== null) clearTimeout(entry.timer);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(name, JSON.stringify(entry.value));
  } catch {
    // Quota or a disabled-storage policy — the in-memory store is still correct; drop the write.
  }
}

/** Flush every pending write immediately. Exported for tests and for the unload path. */
export function flushNow(): void {
  for (const name of [...pending.keys()]) write(name);
}

/** Drop every pending write unwritten. Test isolation only — a queued value must not leak across tests. */
export function discardPendingWrites(): void {
  for (const entry of pending.values()) if (entry.timer !== null) clearTimeout(entry.timer);
  pending.clear();
}

function wireUnloadOnce(): void {
  if (unloadWired || typeof window === 'undefined') return;
  unloadWired = true;
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
}

export function debouncedStorage<T>(name: string, ms = 250): PersistStorage<T> {
  wireUnloadOnce();
  return {
    getItem: (key) => {
      // A rehydrate racing a flush must see the pending value, not the stale stored one.
      const queued = pending.get(key ?? name);
      if (queued) return queued.value as StorageValue<T>;
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as StorageValue<T>;
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      if (typeof localStorage === 'undefined') return;
      const prior = pending.get(key);
      if (prior?.timer != null) clearTimeout(prior.timer);
      const timer = setTimeout(() => write(key), ms);
      pending.set(key, { value: value as StorageValue<unknown>, timer });
    },
    removeItem: (key) => {
      const prior = pending.get(key);
      if (prior?.timer != null) clearTimeout(prior.timer);
      pending.delete(key);
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(key);
    },
  };
}
