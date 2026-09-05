import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * A `PersistStorage` for a localStorage key written by MULTIPLE independent
 * zustand stores — `midnite.settings`, shared by `appearance-store.ts` and,
 * since Phase 64 Theme B, `features/themes/palette-store.ts` (Decision 10:
 * palette state belongs beside accent/motion/density, not bolted onto
 * `ui-store`'s 60-key blob).
 *
 * Zustand's default storage REPLACES the whole JSON value at `name` on every
 * write. Two `persist()` calls sharing one key that way would clobber each
 * other's fields on whichever wrote last — flipping the accent would erase
 * whatever palette-store had just persisted, and vice versa. This merges the
 * incoming `state` into whatever is already on disk instead, so each store
 * only ever touches the fields it actually owns.
 */
export function sharedSettingsStorage<T>(name: string): PersistStorage<T> {
  return {
    getItem: () => {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<T>;
      } catch {
        return null;
      }
    },
    setItem: (_name, value) => {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(name);
      let existingState: Record<string, unknown> = {};
      if (raw) {
        try {
          existingState = (JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? {};
        } catch {
          existingState = {};
        }
      }
      localStorage.setItem(
        name,
        JSON.stringify({
          state: { ...existingState, ...(value.state as Record<string, unknown>) },
          version: value.version,
        }),
      );
    },
    removeItem: () => {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(name);
    },
  };
}
