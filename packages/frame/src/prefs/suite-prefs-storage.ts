import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware';

import type { SuitePrefsKey, SuitePrefsSnapshot } from '@midnite/studio-shared';

import { bridge } from '../bridge';

/**
 * The persistence seam for the suite-wide preference stores (Phase 123 Theme L.2).
 *
 * A store's `persist` storage is this instead of `localStorage`: it reads and writes one
 * group of the runtime's suite-prefs file through the bridge, so a theme change made in one
 * app reaches every open one. Each app has its own `userData` and origin, which is why
 * localStorage could never carry it.
 *
 * - **Read:** the group from the file when the file holds it; otherwise the store's old
 *   localStorage blob (the one-release fallback, and Studio's seed source — see
 *   `suite-prefs-seed.ts`). With no bridge at all (vitest, a plain browser) it is the
 *   fallback storage end to end.
 * - **Write:** the group goes to the file and nowhere else. A write identical to what the
 *   file already holds is dropped, which is what stops `suitePrefsChanged` -> rehydrate ->
 *   write -> `suitePrefsChanged` from ping-ponging.
 */

type StoreHandle = { persist: { rehydrate: () => Promise<void> | void } };

const stores = new Map<SuitePrefsKey, Set<StoreHandle>>();
/** The last value known to be in the file, per group, as JSON. */
const known = new Map<SuitePrefsKey, string>();
let snapshot: SuitePrefsSnapshot | null = null;

const suitePrefs = () => bridge()?.suitePrefs;

/** JSON with sorted keys: the file's copy comes back in schema order, ours in insertion order. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : v,
  );
}

function remember(next: SuitePrefsSnapshot): void {
  snapshot = next;
  for (const key of next.stored) known.set(key, stable(next.prefs[key]));
}

export function suitePrefsStorage<T>(
  key: SuitePrefsKey,
  version: number,
  fallback: PersistStorage<T> | undefined = createJSONStorage<T>(() => localStorage),
): PersistStorage<T> | undefined {
  return {
    getItem: (name) => {
      const api = suitePrefs();
      // No bridge: stay synchronous, so a store hydrates before first paint as it always has.
      if (!api) return fallback ? fallback.getItem(name) : null;
      return (async () => {
        try {
          const current = snapshot ?? (await api.get());
          remember(current);
          if (current.stored.includes(key)) {
            return { state: current.prefs[key], version } as unknown as StorageValue<T>;
          }
        } catch {
          // The file is unreachable — read the old blob rather than boot with defaults.
        }
        return fallback ? fallback.getItem(name) : null;
      })();
    },
    setItem: (name, value) => {
      const api = suitePrefs();
      if (!api) return fallback?.setItem(name, value);
      const state = value.state as unknown;
      const serialised = stable(state);
      if (known.get(key) === serialised) return;
      return (
        api
          .set({ key, value: state } as never)
          .then((result) => {
            if (result.ok) remember(result.snapshot);
          })
          // A failed write must not become an unhandled rejection on every preference click; the
          // next change retries because `known` was not advanced.
          .catch(() => undefined)
      );
    },
    removeItem: (name) => fallback?.removeItem(name),
  };
}

/** Register a store for re-hydration when another app (or window) changes its group. */
export function registerSuitePrefsStore(key: SuitePrefsKey, store: StoreHandle): void {
  const set = stores.get(key) ?? new Set<StoreHandle>();
  set.add(store);
  stores.set(key, set);
}

/**
 * Start listening for `suitePrefsChanged`. Returns the unsubscribe. A group whose JSON differs
 * from the last one seen re-hydrates its stores; an echo of this app's own write does not.
 */
export function subscribeSuitePrefs(): () => void {
  const api = suitePrefs();
  if (!api) return () => undefined;
  return api.onChanged((next) => {
    const changed: SuitePrefsKey[] = [];
    for (const key of next.stored) {
      if (known.get(key) !== stable(next.prefs[key])) changed.push(key);
    }
    remember(next);
    for (const key of changed) {
      for (const store of stores.get(key) ?? []) void store.persist.rehydrate();
    }
  });
}

/** Test seam: forget everything cached. */
export function resetSuitePrefsStorage(): void {
  snapshot = null;
  known.clear();
}
