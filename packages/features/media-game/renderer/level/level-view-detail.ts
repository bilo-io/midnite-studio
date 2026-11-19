/**
 * Terrain detail that follows the view. A level as large as its terrain gets no detail with the level itself (one
 * crop of a 65 km world would be no sharper than the overview), so the editor asks for the part under the view
 * once it is close enough to use it. Pure, bar the hook at the end.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { GAME_LEVEL_TERRAIN_DETAIL_MAX_SIDE, type GameLevelTerrain, type GameLevelTerrainDetail } from '@midnite/studio-shared';

import { bridge } from '@midnite/studio-frame';
import type { View } from './level-view';

export type Area = { minX: number; minZ: number; maxX: number; maxZ: number };

/** A view wider than this (metres) is an overview: the whole-terrain drapes serve it, and no detail is asked for. */
export const VIEW_DETAIL_MAX_VIEW = GAME_LEVEL_TERRAIN_DETAIL_MAX_SIDE / 1.5;

/**
 * The area to ask detail for, given what the view shows: a square one and a half times the view's size class (the
 * next power of two metres up), centred on a grid a quarter of that class. So a pan or zoom within the same class
 * and cell asks for the same area again, and the view always lies inside it. `null` for an overview or no view.
 */
export function viewDetailArea(view: Area | null): Area | null {
  if (!view) return null;
  const side = Math.max(view.maxX - view.minX, view.maxZ - view.minZ);
  if (!(side > 0) || side > VIEW_DETAIL_MAX_VIEW) return null;
  const size = Math.min(VIEW_DETAIL_MAX_VIEW, Math.max(64, 2 ** Math.ceil(Math.log2(side))));
  const cell = size / 4, half = size * 0.75;
  const cx = Math.round((view.minX + view.maxX) / 2 / cell) * cell, cz = Math.round((view.minZ + view.maxZ) / 2 / cell) * cell;
  return { minX: cx - half, minZ: cz - half, maxX: cx + half, maxZ: cz + half };
}

/** The world rectangle a Floorplan view shows. */
export function planViewArea(view: View, size: { width: number; height: number }, scale: { tilewidth: number; tileheight: number; mpt: number; originX: number; originZ: number }): Area {
  const x = (sx: number): number => scale.originX + ((sx - view.x) / view.zoom / scale.tilewidth) * scale.mpt;
  const z = (sy: number): number => scale.originZ + ((sy - view.y) / view.zoom / scale.tileheight) * scale.mpt;
  return { minX: x(0), minZ: z(0), maxX: x(size.width), maxZ: z(size.height) };
}

const keyOf = (a: Area | null): string => (a ? `${a.minX},${a.minZ},${a.maxX},${a.maxZ}` : '');

/**
 * `terrain` with the detail under the current view added, for a terrain that came with none. `viewArea` is polled
 * (the views keep their cameras in refs); a new area is asked for once the view has rested on it for one tick.
 * A terrain that already has a detail, or none at all, passes through untouched.
 */
export function useViewTerrainDetail(gameId: string, scene: string, terrain: GameLevelTerrain | null | undefined, viewArea: () => Area | null, intervalMs = 300): GameLevelTerrain | null {
  const [found, setFound] = useState<{ key: string; detail: GameLevelTerrainDetail | null } | null>(null);
  const viewRef = useRef(viewArea);
  viewRef.current = viewArea;
  const wanted = terrain !== null && terrain !== undefined && !terrain.detail;
  useEffect(() => {
    if (!wanted) {
      setFound(null);
      return;
    }
    let alive = true, pending = '', asked = '', shown = '';
    const tick = (): void => {
      const area = viewDetailArea(viewRef.current());
      const key = keyOf(area);
      // One tick of rest before asking: a pan in progress crosses cells without fetching each.
      if (key !== pending) {
        pending = key;
        return;
      }
      if (key === asked) return;
      asked = key;
      if (!area) {
        shown = '';
        setFound(null);
        return;
      }
      void bridge()
        ?.games.levels.terrainDetail({ gameId, scene, area })
        .then((result) => {
          // A later ask has gone out: this answer is for a place the view has left.
          if (!alive || asked !== key || shown === key) return;
          shown = key;
          setFound({ key, detail: result.ok ? result.value.detail : null });
        })
        .catch(() => undefined);
    };
    const id = window.setInterval(tick, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [wanted, gameId, scene, intervalMs]);
  return useMemo(() => (!terrain ? null : wanted && found?.detail ? { ...terrain, detail: found.detail } : terrain), [terrain, wanted, found]);
}
