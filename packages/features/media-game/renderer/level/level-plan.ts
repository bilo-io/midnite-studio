/**
 * Plan-view geometry for a 3D level (Phase 132 Theme E): pure, no React, no canvas. A 3D level is a Tiled map seen
 * from above (+X right, +Z down), so map pixels and object coordinates are the same thing and `midnite.metresPerTile`
 * is the only scale. What a world position means is `levelEntityToWorld`'s business; nothing here re-derives it
 * except {@link objectCentre}'s rotation rule, which `level-plan.test.ts` pins to it.
 */
import { levelOrigin, levelWorldToPixels, metresPerTile, terrainExtent, type GameLevelTerrain } from '@midnite/studio-shared';

import { objectCentre, type EditLevel, type EditSelection, type LevelObject, type PlanPoint } from './level-edit-model';

/** Metres per tile of a level, by the same rule the kit and the inspector use. */
export const levelMetresPerTile = (level: Pick<EditLevel, 'properties'>): number => metresPerTile({ properties: level.properties });

/** Map pixels per metre along X and Z. */
export function pixelsPerMetre(level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight'>): { x: number; z: number } {
  const mpt = levelMetresPerTile(level);
  return { x: level.tilewidth / mpt, z: level.tileheight / mpt };
}

/** A world-metres point as a map-pixel point (the level's `midnite.originX/Y` is taken off). */
export function metresToPlan(level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight'>, x: number, z: number): PlanPoint {
  return levelWorldToPixels(level, x, z);
}

/**
 * Snap a map-pixel point. `step` is the Floorplan's snap step in map pixels (Theme F's `planSnapStep`); `null`
 * leaves the point free, and with no step given it snaps to a half metre. `alt` leaves it free either way.
 */
export function snapPlan(level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight'>, p: PlanPoint, alt = false, step?: { x: number; y: number } | null): PlanPoint {
  if (alt || step === null) return p;
  const ppm = pixelsPerMetre(level);
  const sx = step?.x ?? ppm.x / 2, sy = step?.y ?? ppm.z / 2;
  // `+ 0` turns a rounded -0 into 0.
  return { x: Math.round(p.x / sx) * sx + 0, y: Math.round(p.y / sy) * sy + 0 };
}

/** The terrain's extent as a map-pixel rectangle. */
export function terrainRect(level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight'>, terrain: Pick<GameLevelTerrain, 'minX' | 'minZ' | 'maxX' | 'maxZ'>): { x: number; y: number; width: number; height: number } {
  const a = metresToPlan(level, terrain.minX, terrain.minZ), b = metresToPlan(level, terrain.maxX, terrain.maxZ);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

/** A terrain's rectangle, with the packs placed round it when the level names any: the bounds cover them all. */
export type TerrainArea = Pick<GameLevelTerrain, 'minX' | 'minZ' | 'maxX' | 'maxZ'> & { packs?: ReadonlyArray<Pick<GameLevelTerrain, 'minX' | 'minZ' | 'maxX' | 'maxZ'>> | undefined };

/** The four corners of a footprint in map pixels, turned about the object's origin as Tiled does. `null` for a point. */
export function footprintCorners(o: Pick<LevelObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>): PlanPoint[] | null {
  const w = o.width ?? 0, h = o.height ?? 0;
  if (w <= 0 || h <= 0) return null;
  const t = ((o.rotation ?? 0) * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([dx, dy]) => ({ x: o.x + dx! * cos - dy! * sin, y: o.y + dx! * sin + dy! * cos }));
}

/** The point the yaw tick ends at: from the centre, `length` pixels the way the object faces (0 is up the screen). */
export function yawTipPoint(o: Pick<LevelObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>, length: number): { from: PlanPoint; to: PlanPoint } {
  const from = objectCentre(o), t = ((o.rotation ?? 0) * Math.PI) / 180;
  return { from, to: { x: from.x + Math.sin(t) * length, y: from.y - Math.cos(t) * length } };
}

/** A path's points in map pixels (its polyline is relative to its origin). */
export const pathPoints = (o: Pick<LevelObject, 'x' | 'y'> & { polyline?: unknown }): PlanPoint[] =>
  Array.isArray(o.polyline) ? (o.polyline as Array<{ x: number; y: number }>).map((p) => ({ x: o.x + p.x, y: o.y + p.y })) : [];

function insidePolygon(p: PlanPoint, poly: readonly PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Pixels on screen within which a marker, a path or the yaw handle counts as hit. */
export const PLAN_HIT_RADIUS_PX = 10;

/** The topmost object at a map-pixel point: inside a footprint, on a path, or within reach of a point. */
export function hitPlan(level: EditLevel, p: PlanPoint, zoom: number, skip?: (ref: { layerId: number; objectId: number }) => boolean): NonNullable<EditSelection> | null {
  const reach = PLAN_HIT_RADIUS_PX / zoom;
  for (let i = level.layers.length - 1; i >= 0; i -= 1) {
    const layer = level.layers[i]!;
    if (layer.type !== 'objectgroup' || layer.visible === false || typeof layer.id !== 'number') continue;
    const objects = layer.objects ?? [];
    for (let j = objects.length - 1; j >= 0; j -= 1) {
      const o = objects[j]!;
      if (skip?.({ layerId: layer.id, objectId: o.id })) continue;
      const corners = footprintCorners(o);
      const path = pathPoints(o);
      let hit = false;
      if (corners) hit = insidePolygon(p, corners);
      else if (path.length > 1) hit = path.some((a, k) => k > 0 && distanceToSegment(p, path[k - 1]!, a) <= reach);
      else hit = Math.hypot(p.x - o.x, p.y - o.y) <= reach;
      if (hit) return { layerId: layer.id, objectId: o.id };
    }
  }
  return null;
}

export type PlanBounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * The rectangle the plan view fits and grids, in map pixels: the map's frame, every object (footprints and paths
 * included) and the terrain's extent. A level need not start at the origin (a starter is centred on it, so its
 * objects sit at negative pixels), so nothing here treats (0, 0) as the top-left corner.
 */
export function planBounds(level: EditLevel, terrain?: TerrainArea | null): PlanBounds {
  const b: PlanBounds = { minX: 0, minY: 0, maxX: level.width * level.tilewidth, maxY: level.height * level.tileheight };
  const add = (p: PlanPoint) => {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  };
  for (const layer of level.layers) {
    if (layer.type !== 'objectgroup') continue;
    for (const o of layer.objects ?? []) {
      const corners = footprintCorners(o);
      if (corners) corners.forEach(add);
      else add({ x: o.x, y: o.y });
      pathPoints(o).forEach(add);
    }
  }
  if (terrain) {
    const r = terrainRect(level, terrainExtent(terrain));
    add({ x: r.x, y: r.y });
    add({ x: r.x + r.width, y: r.y + r.height });
  }
  return b;
}

/**
 * What the first fit frames: {@link planBounds}, except that a terrain far larger than the work (the map and its
 * objects) is left out, so a 80 m level on a 10 km terrain opens on the level, not on a speck in the outline.
 * The terrain stays on screen at any zoom that shows it; zooming out reaches all of it.
 */
/** A terrain more than this many times the area of the work is left out of the first fit. */
const FRAME_TERRAIN_RATIO = 10;

export function planFrameBounds(level: EditLevel, terrain?: TerrainArea | null): PlanBounds {
  const all = planBounds(level, terrain);
  if (!terrain) return all;
  const work = planBounds(level);
  const area = (b: PlanBounds) => (b.maxX - b.minX) * (b.maxY - b.minY);
  return area(all) > FRAME_TERRAIN_RATIO * area(work) ? work : all;
}

/** The metre grid to draw over `bounds` (default: the map's frame), as pixel positions: 1 m lines, every tenth bold; zoomed out, the step grows to 10 m, 100 m, then 1 km. Lines closer than `minGapPx` on screen are dropped. */
export function gridLines(
  level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight' | 'width' | 'height'>,
  zoom: number,
  minGapPx = 6,
  bounds?: PlanBounds,
): { x: Array<{ at: number; bold: boolean }>; z: Array<{ at: number; bold: boolean }> } {
  const ppm = pixelsPerMetre(level);
  const box = bounds ?? { minX: 0, minY: 0, maxX: level.width * level.tilewidth, maxY: level.height * level.tileheight };
  // Show every metre when they are far enough apart, else every 10 m, 100 m or 1 km, else nothing.
  const step = [1, 10, 100, 1000].find((s) => ppm.x * zoom * s >= minGapPx) ?? 0;
  if (step === 0) return { x: [], z: [] };
  // Lines sit on whole world metres, so with an origin they stay aligned with the terrain; `at` is the map pixel.
  const origin = levelOrigin(level);
  const axis = (min: number, max: number, scale: number, base: number) => {
    const out: Array<{ at: number; bold: boolean }> = [];
    for (let m = Math.ceil((base + min / scale) / step) * step; (m - base) * scale <= max; m += step) out.push({ at: (m - base) * scale, bold: step <= 10 ? ((m % 10) + 10) % 10 === 0 : (((m / step) % 10) + 10) % 10 === 0 });
    return out;
  };
  return { x: axis(box.minX, box.maxX, ppm.x, origin.x), z: axis(box.minY, box.maxY, ppm.z, origin.z) };
}
