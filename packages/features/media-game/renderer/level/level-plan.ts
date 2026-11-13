/**
 * Plan-view geometry for a 3D level (Phase 132 Theme E): pure, no React, no canvas. A 3D level is a Tiled map seen
 * from above (+X right, +Z down), so map pixels and object coordinates are the same thing and `midnite.metresPerTile`
 * is the only scale. What a world position means is `levelEntityToWorld`'s business; nothing here re-derives it
 * except {@link objectCentre}'s rotation rule, which `level-plan.test.ts` pins to it.
 */
import { metresPerTile, type GameLevelTerrain } from '@midnite/studio-shared';

import { objectCentre, type EditLevel, type EditSelection, type LevelObject, type PlanPoint } from './level-edit-model';

/** Metres per tile of a level, by the same rule the kit and the inspector use. */
export const levelMetresPerTile = (level: Pick<EditLevel, 'properties'>): number => metresPerTile({ properties: level.properties });

/** Map pixels per metre along X and Z. */
export function pixelsPerMetre(level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight'>): { x: number; z: number } {
  const mpt = levelMetresPerTile(level);
  return { x: level.tilewidth / mpt, z: level.tileheight / mpt };
}

/** A metres-space point as a map-pixel point. */
export function metresToPlan(level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight'>, x: number, z: number): PlanPoint {
  const ppm = pixelsPerMetre(level);
  return { x: x * ppm.x, y: z * ppm.z };
}

/** Snap a map-pixel point to a half-metre grid; `alt` leaves it free. */
export function snapPlan(level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight'>, p: PlanPoint, alt = false): PlanPoint {
  if (alt) return p;
  const ppm = pixelsPerMetre(level);
  // `+ 0` turns a rounded -0 into 0.
  return { x: (Math.round((p.x / ppm.x) * 2) / 2) * ppm.x + 0, y: (Math.round((p.y / ppm.z) * 2) / 2) * ppm.z + 0 };
}

/** The terrain's extent as a map-pixel rectangle. */
export function terrainRect(level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight'>, terrain: Pick<GameLevelTerrain, 'minX' | 'minZ' | 'maxX' | 'maxZ'>): { x: number; y: number; width: number; height: number } {
  const a = metresToPlan(level, terrain.minX, terrain.minZ), b = metresToPlan(level, terrain.maxX, terrain.maxZ);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

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
export function hitPlan(level: EditLevel, p: PlanPoint, zoom: number): NonNullable<EditSelection> | null {
  const reach = PLAN_HIT_RADIUS_PX / zoom;
  for (let i = level.layers.length - 1; i >= 0; i -= 1) {
    const layer = level.layers[i]!;
    if (layer.type !== 'objectgroup' || layer.visible === false || typeof layer.id !== 'number') continue;
    const objects = layer.objects ?? [];
    for (let j = objects.length - 1; j >= 0; j -= 1) {
      const o = objects[j]!;
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
export function planBounds(level: EditLevel, terrain?: Pick<GameLevelTerrain, 'minX' | 'minZ' | 'maxX' | 'maxZ'> | null): PlanBounds {
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
    const r = terrainRect(level, terrain);
    add({ x: r.x, y: r.y });
    add({ x: r.x + r.width, y: r.y + r.height });
  }
  return b;
}

/** The metre grid to draw over `bounds` (default: the map's frame), as pixel positions: 1 m lines, every tenth bold. Lines closer than `minGapPx` on screen are dropped. */
export function gridLines(
  level: Pick<EditLevel, 'properties' | 'tilewidth' | 'tileheight' | 'width' | 'height'>,
  zoom: number,
  minGapPx = 6,
  bounds?: PlanBounds,
): { x: Array<{ at: number; bold: boolean }>; z: Array<{ at: number; bold: boolean }> } {
  const ppm = pixelsPerMetre(level);
  const box = bounds ?? { minX: 0, minY: 0, maxX: level.width * level.tilewidth, maxY: level.height * level.tileheight };
  // Show every metre when they are far enough apart, else every 10 m, else nothing.
  const step = ppm.x * zoom >= minGapPx ? 1 : ppm.x * zoom * 10 >= minGapPx ? 10 : 0;
  if (step === 0) return { x: [], z: [] };
  const axis = (min: number, max: number, scale: number) => {
    const out: Array<{ at: number; bold: boolean }> = [];
    for (let m = Math.ceil(min / scale / step) * step; m * scale <= max; m += step) out.push({ at: m * scale, bold: ((m % 10) + 10) % 10 === 0 });
    return out;
  };
  return { x: axis(box.minX, box.maxX, ppm.x), z: axis(box.minY, box.maxY, ppm.z) };
}
