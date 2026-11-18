import { bridge } from '@midnite/studio-frame';
import type { GameDebugOptions } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';

/** The nav-mesh as `[x, z]` metre polygons. */
export type NavPolygons = ReadonlyArray<ReadonlyArray<readonly [number, number]>>;

const NONE: NavPolygons = [];

/**
 * The running game's nav-mesh for the editor's Nav-mesh overlay (Phase 140 Theme G): fetched with `games.navMesh`
 * while the switch is on and a game runs, and again for each new run. The editor never computes one itself, so what it
 * draws is what the AI walks. A refusal (a mesh over the vertex cap, a game without a nav-mesh) says why once.
 */
export function useNavMesh(gameId: string, enabled: boolean, runKey: string | undefined, onError: (message: string) => void): NavPolygons {
  const [polygons, setPolygons] = useState<NavPolygons>(NONE);
  useEffect(() => {
    if (!enabled) {
      setPolygons(NONE);
      return undefined;
    }
    const games = bridge()?.games;
    if (!games?.navMesh) return undefined;
    let cancelled = false;
    void games.navMesh({ gameId }).then((r) => {
      if (cancelled) return;
      if (r.ok) setPolygons(r.value.polygons);
      else {
        setPolygons(NONE);
        onError(r.kind === 'error' ? r.message : 'Could not read the nav-mesh.');
      }
    });
    return () => {
      cancelled = true;
    };
    // `onError` is a fresh closure every render; a refetch is driven by the switch, the game and the run only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, enabled, runKey]);
  return polygons;
}

/**
 * Push the View switches to the running game (`games.debug`), so editor and game show the same overlays. Called with
 * the current switches when a game starts (a new page knows nothing of them) and with the one that changed on a toggle.
 */
export function pushDebug(gameId: string, patch: Partial<GameDebugOptions>): void {
  void bridge()?.games.debug?.({ gameId, ...patch });
}
