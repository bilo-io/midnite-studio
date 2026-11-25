import { colliderShapes, spawnerLabel, spawnerShapes, triggerShapes, type GameEntitySnapshot, type OverlayShape } from '@midnite/studio-shared';

import type { SceneExtras } from '../3d/level-extras';
import type { LevelOverlays } from '../3d/level-view-store';
import type { EditLevel, PlanPoint } from '../level-edit-model';
import { worldToObjectPoint } from '../3d/level-world';
import type { CanvasExtras } from '../level-overlay-draw';
import { ghostLinks, ghostPoint } from './live-model';

/**
 * Everything the editor draws over the level, derived once per change from the level, the View switches, the live
 * entities and the fetched nav-mesh (Phase 140 Themes E to G): the canvas form (object pixels) and the 3D form
 * (world metres). Pure; the editor memoises it.
 */
export type LevelExtrasInput = {
  level: EditLevel;
  is3d: boolean;
  overlays: LevelOverlays;
  ghosts: readonly GameEntitySnapshot[];
  /** The kit's nav-mesh polygons in `[x, z]` metres, fetched with `games.navMesh`. */
  nav: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
};

const objectIds = (shapes: readonly OverlayShape[]): number[] => shapes.flatMap((s) => (s.kind === 'cell' ? [] : [s.objectId]));

export function levelExtras(input: LevelExtrasInput): { canvas: CanvasExtras; scene: SceneExtras } {
  const { level, is3d, overlays, ghosts } = input;
  const colliders = overlays.colliders ? colliderShapes(level) : [];
  const triggers = overlays.triggers ? triggerShapes(level) : [];
  const spawnerList = overlays.spawners ? spawnerShapes(level) : [];
  const spawnerObjects = new Map<number, { properties?: ReadonlyArray<{ name: string; value?: unknown }> }>();
  if (spawnerList.length) for (const l of level.layers) for (const o of l.objects ?? []) spawnerObjects.set(o.id, o);
  const spawners = spawnerList.map((shape) => ({ shape, label: spawnerLabel(shape.kind === 'cell' ? {} : (spawnerObjects.get(shape.objectId) ?? {})) }));
  const nav = overlays.nav ? input.nav : [];
  const canvas: CanvasExtras = {
    colliders,
    triggers,
    spawners,
    nav: nav.map((poly) => poly.map(([x, z]): PlanPoint => worldToObjectPoint(level, x, z))),
    ghosts: ghosts.map((ghost) => ({ ghost, at: ghostPoint(level, ghost, is3d) })),
    links: ghostLinks(level, ghosts, is3d),
  };
  const scene: SceneExtras = {
    colliderIds: objectIds(colliders),
    triggerIds: objectIds(triggers),
    spawnerIds: objectIds(spawnerList),
    nav,
    ghosts: ghosts.map((g, key) => ({ key, id: g.id, type: g.type, alive: g.alive, x: g.x, y: g.y, z: g.z ?? 0 })),
  };
  return { canvas, scene };
}
