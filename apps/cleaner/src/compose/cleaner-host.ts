import { createStore, useStore } from 'zustand';

import type { OptimizerHost, OptimizerSettingsState } from '@midnite/studio-feature-optimizer/renderer';

/**
 * Cleaner's {@link OptimizerHost}: the optimizer's settings as Cleaner's own
 * persisted state. Studio keeps the same slice in `ui-store`; a standalone app
 * has no such store, so the settings live here, in this app's own localStorage
 * (the app's own origin/userData — Studio's blob is untouched).
 *
 * Every destructive switch defaults off, as in Studio.
 */
export const CLEANER_SETTINGS_KEY = 'midnite-cleaner.settings';

type Persisted = Pick<
  OptimizerSettingsState,
  | 'optimizerEnabled'
  | 'disabledEcosystems'
  | 'allowSystemCacheClean'
  | 'systemCacheConsentGiven'
  | 'allowTrashEmpty'
  | 'trashEmptyConsentGiven'
>;

const DEFAULTS: Persisted = {
  optimizerEnabled: false,
  disabledEcosystems: [],
  allowSystemCacheClean: false,
  systemCacheConsentGiven: false,
  allowTrashEmpty: false,
  trashEmptyConsentGiven: false,
};

function load(storage: Storage | undefined): Persisted {
  try {
    const raw = storage?.getItem(CLEANER_SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function createCleanerHost(storage: Storage | undefined = safeLocalStorage()): OptimizerHost {
  const store = createStore<OptimizerSettingsState>((set) => ({
    ...load(storage),
    setOptimizerEnabled: (optimizerEnabled) => set({ optimizerEnabled }),
    toggleEcosystem: (id) =>
      set((s) => ({
        disabledEcosystems: s.disabledEcosystems.includes(id)
          ? s.disabledEcosystems.filter((e) => e !== id)
          : [...s.disabledEcosystems, id],
      })),
    setAllowSystemCacheClean: (allowSystemCacheClean) => set({ allowSystemCacheClean }),
    setSystemCacheConsentGiven: (systemCacheConsentGiven) => set({ systemCacheConsentGiven }),
    setAllowTrashEmpty: (allowTrashEmpty) => set({ allowTrashEmpty }),
    setTrashEmptyConsentGiven: (trashEmptyConsentGiven) => set({ trashEmptyConsentGiven }),
    metricsIdleIntervalMs: 5_000,
    // Cleaner has no repository selection; Storage's "open this repository" is a no-op here.
    selectRepo: () => {},
  }));
  store.subscribe((s) => {
    const persisted: Persisted = {
      optimizerEnabled: s.optimizerEnabled,
      disabledEcosystems: s.disabledEcosystems,
      allowSystemCacheClean: s.allowSystemCacheClean,
      systemCacheConsentGiven: s.systemCacheConsentGiven,
      allowTrashEmpty: s.allowTrashEmpty,
      trashEmptyConsentGiven: s.trashEmptyConsentGiven,
    };
    try {
      storage?.setItem(CLEANER_SETTINGS_KEY, JSON.stringify(persisted));
    } catch {
      /* storage full or blocked — settings just do not persist */
    }
  });
  return {
    useSettings: (selector) => useStore(store, selector),
    getSettings: () => store.getState(),
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
