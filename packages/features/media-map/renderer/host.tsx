import { createContext, useContext, type ReactNode } from 'react';

/**
 * The Map feature's host port (Phase 113 Theme S) — what Maps reads from the app that composes it,
 * beyond the frame and the media kit.
 *
 * Maps needs very little: the measurement units Settings ▸ Media chooses. Studio keeps that in its
 * persisted `ui-store` (`mapUnits`), so its adapter is `packages/app/src/compose/media-map-host.tsx`;
 * Gamer keeps none and measures in metres. Everything is optional, and a tab rendered without a
 * provider works with the defaults — there is no wiring bug to throw about.
 */
export type MapUnits = 'metric' | 'imperial';

export type MapHost = {
  /** The units distances and areas are shown in. A hook. Absent → metric. */
  useUnits?: () => MapUnits;
};

const MapHostContext = createContext<MapHost>({});

export function MapHostProvider({ host, children }: { host: MapHost; children: ReactNode }) {
  return <MapHostContext.Provider value={host}>{children}</MapHostContext.Provider>;
}

/** The installed host, or an empty one outside a provider. */
export function useMapHost(): MapHost {
  return useContext(MapHostContext);
}

const metric = (): MapUnits => 'metric';

/** The units to show — the host's, else metric. */
export function useMapUnits(): MapUnits {
  return (useMapHost().useUnits ?? metric)();
}
