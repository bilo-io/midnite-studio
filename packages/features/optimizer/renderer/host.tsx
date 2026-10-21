import { createContext, useContext, type ReactNode } from 'react';

import type { Ecosystem } from '@midnite/studio-shared';

/**
 * The optimizer's host port — what this feature needs from the app that
 * composes it, beyond the frame (Phase 113 Theme C).
 *
 * The optimizer's settings are persisted app state: today they live in
 * Studio's `ui-store` (and its migrations), and moving them out is a
 * persisted-state migration this theme deliberately does not make. So the
 * feature declares the slice it reads and writes, and the composing app
 * supplies it. Studio's adapter (`packages/app/src/compose/optimizer-host.ts`)
 * is two lines, because `ui-store`'s state is a structural superset of
 * {@link OptimizerSettingsState} — and `satisfies OptimizerHost` there turns
 * any drift between the two into a type error.
 *
 * The port belongs to the feature, not the frame: it names optimizer
 * settings, which no other feature has any business reading.
 */
export type OptimizerSettingsState = {
  /** Settings ▸ Workspace Optimizer's master switch — destructive actions stay off until it is on. */
  optimizerEnabled: boolean;
  setOptimizerEnabled: (enabled: boolean) => void;
  /** Ecosystems Smart Scan skips (Phase 72 Theme E). */
  disabledEcosystems: readonly Ecosystem[];
  toggleEcosystem: (id: Ecosystem) => void;
  /** The system-cache clean opt-in and its one-time consent (Phase 73). */
  allowSystemCacheClean: boolean;
  setAllowSystemCacheClean: (allow: boolean) => void;
  systemCacheConsentGiven: boolean;
  setSystemCacheConsentGiven: (given: boolean) => void;
  /** Emptying the Trash: its own opt-in and consent pair (Phase 74 Theme D). */
  allowTrashEmpty: boolean;
  setAllowTrashEmpty: (allow: boolean) => void;
  trashEmptyConsentGiven: boolean;
  setTrashEmptyConsentGiven: (given: boolean) => void;
  /** The metrics stream's cadence while the window is idle — a frame-wide setting the charts honour. */
  metricsIdleIntervalMs: number;
  /** Storage's "open this repository" — selects it in the host app. */
  selectRepo: (repoId: string | null) => void;
};

export type OptimizerHost = {
  /** Subscribe to one slice of the settings, re-rendering when it changes. A hook. */
  useSettings: <T>(selector: (state: OptimizerSettingsState) => T) => T;
  /** Read the settings once, outside a render (a one-shot request reads them fresh). */
  getSettings: () => OptimizerSettingsState;
};

const OptimizerHostContext = createContext<OptimizerHost | null>(null);

export function OptimizerHostProvider({ host, children }: { host: OptimizerHost; children: ReactNode }) {
  return <OptimizerHostContext.Provider value={host}>{children}</OptimizerHostContext.Provider>;
}

/**
 * The installed host. Throws without a provider — an optimizer rendered
 * unwired would read defaults and drop every setting the user changes, which
 * is worse than not rendering.
 */
export function useOptimizerHost(): OptimizerHost {
  const host = useContext(OptimizerHostContext);
  if (!host) throw new Error('The optimizer feature must be rendered inside <OptimizerHostProvider>');
  return host;
}

/** `useOptimizerHost().useSettings(selector)` — the call sites' shorthand. */
export function useOptimizerSettings<T>(selector: (state: OptimizerSettingsState) => T): T {
  return useOptimizerHost().useSettings(selector);
}
