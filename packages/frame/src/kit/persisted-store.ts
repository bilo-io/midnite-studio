import { createStore, type StoreApi } from 'zustand';

/** `localStorage` if the environment has a usable one — accessing it can throw. */
export function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export type PersistedStoreOptions<S, P> = {
  /** Storage key; one per app, namespaced by it (`midnite-<app>.settings`). */
  key: string;
  /** The persisted slice's defaults; a missing, corrupt or partial blob falls back to them. */
  defaults: P;
  /** Projects the full state onto the slice that is written through. */
  pick: (state: S) => P;
  /** Builds the full state (actions included) from the loaded slice. */
  state: (set: StoreApi<S>['setState'], initial: P) => S;
  storage?: Storage;
};

/**
 * A zustand store whose `pick`ed slice is loaded from storage on creation and written
 * through on every change. Every storage failure is swallowed: settings just do not
 * persist, they never crash the app.
 */
export function createPersistedStore<S, P extends object>(
  opts: PersistedStoreOptions<S, P>,
): StoreApi<S> {
  const storage = 'storage' in opts ? opts.storage : safeLocalStorage();
  const load = (): P => {
    try {
      const raw = storage?.getItem(opts.key);
      return raw ? { ...opts.defaults, ...(JSON.parse(raw) as Partial<P>) } : opts.defaults;
    } catch {
      return opts.defaults;
    }
  };
  const store = createStore<S>((set) => opts.state(set, load()));
  store.subscribe((s) => {
    try {
      storage?.setItem(opts.key, JSON.stringify(opts.pick(s)));
    } catch {
      /* storage full or blocked */
    }
  });
  return store;
}
