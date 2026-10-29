import { createContext, useContext, type ReactNode } from 'react';

/**
 * What the title bar's right cluster reads from the app (Phase 123 Theme J.4).
 *
 * Studio keeps both in its own `ui-store`, which the frame may not import, so they arrive here. The
 * defaults are what an app with no such settings gets: a metrics poll at the idle cadence and every
 * automatic network call on, except IP geolocation (off until someone turns it on, as in Studio).
 */
export type TitleBarHost = {
  /** Cadence of the battery's metrics poll while its popover is closed. */
  metricsIdleIntervalMs: number;
  /** The privacy master switch and per-feature egress switches the weather fetch honours. */
  egress: { allAutomaticOff: boolean; switches: Record<string, boolean> };
  /** The stored "locate by IP" flag, before the master switch is applied. */
  locateByIpEnabled: boolean;
};

export const DEFAULT_TITLE_BAR_HOST: TitleBarHost = {
  metricsIdleIntervalMs: 5000,
  egress: { allAutomaticOff: false, switches: {} },
  locateByIpEnabled: false,
};

const TitleBarHostContext = createContext<TitleBarHost>(DEFAULT_TITLE_BAR_HOST);

export function TitleBarHostProvider({ host, children }: { host: TitleBarHost; children: ReactNode }) {
  return <TitleBarHostContext.Provider value={host}>{children}</TitleBarHostContext.Provider>;
}

export function useTitleBarHost(): TitleBarHost {
  return useContext(TitleBarHostContext);
}
