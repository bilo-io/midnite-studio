import { levelProperties } from './game-level';
import { GID_MASK, tileOf, readTmj } from './sprite/map-view';

/**
 * Collider and trigger overlays (Phase 140 Theme F): which parts of a level the game treats as solid, and which
 * as a trigger zone. Pure and drawn by both editor views; the kit's debug draw (Theme G) shows the same two sets.
 *
 * The rules are the kit's own: a 2D tile cell is solid when the `collision` tile layer has a tile there
 * (`kit/core/tiled-objects.js` `collisionGrid`), and a 3D `prop` with a footprint is solid unless
 * `collider: 'none'` (`kit/three/level.js`). `level-overlays.test.ts` runs both over the starter levels.
 */

/** Object types drawn as triggers. */
export const TRIGGER_TYPES = ['exit', 'checkpoint', 'trigger', 'hazard'] as const;
/** Object type of a spawn zone: where the game spawns traffic, pedestrians or any kind it defines. */
export const SPAWNER_TYPE = 'spawner';
/** Kinds the editor suggests for a spawner's `spawns`; the game may define others. */
export const SPAWNER_KINDS = ['traffic', 'pedestrians'] as const;
export const SPAWNER_DEFAULT_DENSITY = 1;
/** The layer 2D collision is read from, as `collisionGrid` reads it. */
export const COLLISION_LAYER_NAME = 'collision';

export type OverlayShape =
  /** One solid tile cell (column, row); `oneWay` when its tile's `kind` is `oneway`. */
  | { kind: 'cell'; col: number; row: number; oneWay: boolean }
  /** An object footprint in map pixels as authored: Tiled's top-left `x`/`y`, size, rotation in degrees. */
  | { kind: 'rect'; objectId: number; type: string; x: number; y: number; width: number; height: number; rotation: number }
  /** An object with no footprint (a point trigger, an exit marker). */
  | { kind: 'point'; objectId: number; type: string; x: number; y: number };

type RawObject = { id?: unknown; type?: unknown; class?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown; rotation?: unknown; properties?: ReadonlyArray<{ name: string; value?: unknown }> };

const finite = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function* objects(level: unknown): Generator<{ object: RawObject; type: string }> {
  const layers = (level as { layers?: unknown } | null)?.layers;
  if (!Array.isArray(layers)) return;
  for (const layer of layers as Array<{ type?: unknown; visible?: unknown; objects?: unknown }>) {
    if (layer?.type !== 'objectgroup' || layer.visible === false || !Array.isArray(layer.objects)) continue;
    for (const object of layer.objects as RawObject[]) {
      const type = typeof object.type === 'string' && object.type ? object.type : typeof object.class === 'string' ? object.class : '';
      yield { object, type };
    }
  }
}

function shapeOf(object: RawObject, type: string): OverlayShape {
  const base = { objectId: finite(object.id), type, x: finite(object.x), y: finite(object.y) };
  const width = finite(object.width), height = finite(object.height);
  return width > 0 && height > 0 ? { kind: 'rect', ...base, width, height, rotation: finite(object.rotation) } : { kind: 'point', ...base };
}

/** The solid parts of a level: collision tile cells (2D) and `prop` footprints that collide (3D). */
export function colliderShapes(level: unknown): OverlayShape[] {
  const out: OverlayShape[] = [];
  const tmj = readTmj(level);
  if (tmj) {
    const layer = tmj.layers.find((l) => l.type === 'tilelayer' && l.name === COLLISION_LAYER_NAME);
    if (layer?.type === 'tilelayer') {
      const width = layer.width || tmj.width;
      layer.data.forEach((gid, i) => {
        if (!gid) return;
        const hit = tileOf(tmj.tilesets, gid & GID_MASK);
        const kind = hit?.tileset.tiles?.find((t) => t.id === hit.local)?.properties?.find((p) => p.name === 'kind')?.value;
        out.push({ kind: 'cell', col: i % width, row: Math.floor(i / width), oneWay: kind === 'oneway' });
      });
    }
  }
  for (const { object, type } of objects(level)) {
    if (type !== 'prop' || levelProperties(object).collider === 'none') continue;
    const shape = shapeOf(object, type);
    if (shape.kind === 'rect') out.push(shape);
  }
  return out;
}

/** The trigger zones of a level: `exit`, `checkpoint`, `trigger` and `hazard` objects. */
export function triggerShapes(level: unknown): OverlayShape[] {
  const out: OverlayShape[] = [];
  for (const { object, type } of objects(level)) if ((TRIGGER_TYPES as readonly string[]).includes(type)) out.push(shapeOf(object, type));
  return out;
}

/** A spawner's `spawns` kind (default `traffic`) and `density` (default 1, never negative), as the plan label and the game read them. */
export function spawnerInfo(object: { properties?: ReadonlyArray<{ name: string; value?: unknown }> | undefined }): { spawns: string; density: number } {
  const props = levelProperties(object);
  const spawns = typeof props.spawns === 'string' && props.spawns.trim() ? props.spawns.trim() : SPAWNER_KINDS[0];
  const density = typeof props.density === 'number' && Number.isFinite(props.density) ? Math.max(0, props.density) : SPAWNER_DEFAULT_DENSITY;
  return { spawns, density };
}

/** `traffic ×1.5`: what a spawner spawns and how densely. */
export const spawnerLabel = (object: { properties?: ReadonlyArray<{ name: string; value?: unknown }> | undefined }): string => {
  const { spawns, density } = spawnerInfo(object);
  return `${spawns} ×${Number(density.toFixed(2))}`;
};

/** The spawn zones of a level: `spawner` objects. */
export function spawnerShapes(level: unknown): OverlayShape[] {
  const out: OverlayShape[] = [];
  for (const { object, type } of objects(level)) if (type === SPAWNER_TYPE) out.push(shapeOf(object, type));
  return out;
}
