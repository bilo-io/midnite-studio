import { createContext, useContext, type ReactNode } from 'react';

/**
 * What the title bar's right cluster reads from the app (Phase 123 Theme J.4).
 *
 * Studio keeps both in its own `ui-store`, which the frame may not import, so they arrive here. The
 * defaults are what an app that does not fill the host gets: no
 * automatic network call at all (the privacy master switch reads "off"), so an app that has not wired the
 * user's privacy settings never fetches weather behind them.
 */
export type TitleBarHost = {
  /** The privacy master switch and per-feature egress switches the weather fetch honours. */
  egress: { allAutomaticOff: boolean; switches: Record<string, boolean> };
  /** The stored "locate by IP" flag, before the master switch is applied. */
  locateByIpEnabled: boolean;
};

export const DEFAULT_TITLE_BAR_HOST: TitleBarHost = {
  egress: { allAutomaticOff: true, switches: {} },
  locateByIpEnabled: false,
};

const TitleBarHostContext = createContext<TitleBarHost>(DEFAULT_TITLE_BAR_HOST);

export function TitleBarHostProvider({ host, children }: { host: TitleBarHost; children: ReactNode }) {
  return <TitleBarHostContext.Provider value={host}>{children}</TitleBarHostContext.Provider>;
}

export function useTitleBarHost(): TitleBarHost {
  return useContext(TitleBarHostContext);
}
