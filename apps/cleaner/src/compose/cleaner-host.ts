import { useStore } from 'zustand';

import { createPersistedStore, safeLocalStorage } from '@midnite/studio-frame';

import type {
  OptimizerHost,
  OptimizerSettingsState,
} from '@midnite/studio-feature-optimizer/renderer';

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

function pickPersisted(s: OptimizerSettingsState): Persisted {
  return {
    optimizerEnabled: s.optimizerEnabled,
    disabledEcosystems: s.disabledEcosystems,
    allowSystemCacheClean: s.allowSystemCacheClean,
    systemCacheConsentGiven: s.systemCacheConsentGiven,
    allowTrashEmpty: s.allowTrashEmpty,
    trashEmptyConsentGiven: s.trashEmptyConsentGiven,
  };
}

export function createCleanerHost(
  storage: Storage | undefined = safeLocalStorage(),
): OptimizerHost {
  const store = createPersistedStore<OptimizerSettingsState, Persisted>({
    key: CLEANER_SETTINGS_KEY,
    defaults: DEFAULTS,
    storage,
    pick: pickPersisted,
    state: (set, initial) => ({
      ...initial,
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
    }),
  });
  return {
    useSettings: (selector) => useStore(store, selector),
    getSettings: () => store.getState(),
  };
}
