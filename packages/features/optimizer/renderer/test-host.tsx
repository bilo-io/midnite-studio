import type { ReactNode } from 'react';

import { createStore, useStore } from 'zustand';

import { OptimizerHostProvider, type OptimizerHost, type OptimizerSettingsState } from './host';

/**
 * An in-memory {@link OptimizerHost} for this package's own tests — the
 * feature rendered with no app around it, which is the point of a feature
 * package. Studio's adapter over `ui-store` is tested where it lives
 * (`packages/app/src/compose/optimizer/`).
 *
 * Test-only: nothing outside `*.test.tsx` imports it.
 */
export function createTestOptimizerHost(initial: Partial<OptimizerSettingsState> = {}) {
  const store = createStore<OptimizerSettingsState>((set) => ({
    optimizerEnabled: false,
    setOptimizerEnabled: (optimizerEnabled) => set({ optimizerEnabled }),
    disabledEcosystems: [],
    toggleEcosystem: (id) =>
      set((s) => ({
        disabledEcosystems: s.disabledEcosystems.includes(id)
          ? s.disabledEcosystems.filter((e) => e !== id)
          : [...s.disabledEcosystems, id],
      })),
    allowSystemCacheClean: false,
    setAllowSystemCacheClean: (allowSystemCacheClean) => set({ allowSystemCacheClean }),
    systemCacheConsentGiven: false,
    setSystemCacheConsentGiven: (systemCacheConsentGiven) => set({ systemCacheConsentGiven }),
    allowTrashEmpty: false,
    setAllowTrashEmpty: (allowTrashEmpty) => set({ allowTrashEmpty }),
    trashEmptyConsentGiven: false,
    setTrashEmptyConsentGiven: (trashEmptyConsentGiven) => set({ trashEmptyConsentGiven }),
    metricsIdleIntervalMs: 5_000,
    selectRepo: () => {},
    ...initial,
  }));
  const host: OptimizerHost = {
    useSettings: (selector) => useStore(store, selector),
    getSettings: () => store.getState(),
  };
  function Wrapper({ children }: { children: ReactNode }) {
    return <OptimizerHostProvider host={host}>{children}</OptimizerHostProvider>;
  }
  return { host, store, Wrapper };
}
