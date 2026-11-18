import { z } from 'zod';

import { LevelEntityFieldsSchema, type LevelEntityFields, type LevelPropertyValue } from './game-level-ops';
import { GameSceneNameSchema } from './media-game';

/**
 * Level prefabs (Phase 139 Theme E): a named group of objects saved once (`levels/prefabs/<name>.prefab.json`) and
 * placed many times. An instance is baked into the level as ordinary Tiled objects carrying three properties, so
 * the kit and every export read it as any object (Tiled's own template model). Pure and zod-only.
 */
export const GAME_PREFAB_DIR = 'levels/prefabs';
export const GAME_PREFAB_EXT = '.prefab.json';
/** The most a prefab file may weigh. */
export const GAME_PREFAB_MAX_BYTES = 512 * 1024;
/** Same safe-name rule as scenes. */
export const GamePrefabNameSchema = GameSceneNameSchema;

export const GamePrefabSchema = z.object({
  version: z.literal(1),
  name: GamePrefabNameSchema,
  dimension: z.enum(['2d', '3d']),
  /** Objects relative to the pivot (0,0), in pixels, in a Tiled object shape without ids. */
  objects: z.array(LevelEntityFieldsSchema).min(1).max(500),
  description: z.string().max(400).optional(),
});
export type GamePrefab = z.infer<typeof GamePrefabSchema>;

/** The Tiled property names that tie an object to its prefab. */
export const PREFAB_PROPS = {
  prefab: 'midnite.prefab',
  instance: 'midnite.prefabInstance',
  index: 'midnite.prefabIndex',
  overrides: 'midnite.prefabOverrides',
} as const;

const TAGS: readonly string[] = Object.values(PREFAB_PROPS);
/** A fixed-point round that keeps `cos(90deg)` noise out of saved coordinates. */
const tidy = (n: number): number => Math.round(n * 10000) / 10000;

/** An object as the editor holds it: the entity fields plus an optional id (ignored). */
export type PrefabSourceObject = LevelEntityFields & { id?: number };

/** The prefab's pivot is the centre of the objects' bounds, snapped to whole px; objects are stored relative to it. */
export function prefabFromObjects(name: string, dimension: '2d' | '3d', objects: readonly PrefabSourceObject[], description?: string): GamePrefab {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objects) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + (o.width ?? 0));
    maxY = Math.max(maxY, o.y + (o.height ?? 0));
  }
  const px = objects.length ? Math.round((minX + maxX) / 2) : 0;
  const py = objects.length ? Math.round((minY + maxY) / 2) : 0;
  const relative = objects.map((source): LevelEntityFields => {
    const { id: _id, ...rest } = source;
    const out: LevelEntityFields = { ...rest, x: tidy(source.x - px), y: tidy(source.y - py) };
    if (source.properties) {
      const kept = Object.fromEntries(Object.entries(source.properties).filter(([k]) => !TAGS.includes(k)));
      if (Object.keys(kept).length) out.properties = kept;
      else delete out.properties;
    }
    return structuredClone(out);
  });
  return { version: 1, name, dimension, objects: relative, ...(description ? { description } : {}) };
}

/** New objects for one placed instance: offsets rotated clockwise (Tiled's direction) by `rotation` degrees about the pivot, moved to `at`, tagged. */
export function instantiatePrefab(prefab: GamePrefab, at: { x: number; y: number }, rotation: number, instanceId: string): LevelEntityFields[] {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return prefab.objects.map((source, index) => {
    const out: LevelEntityFields = structuredClone(source);
    out.x = tidy(at.x + source.x * cos - source.y * sin);
    out.y = tidy(at.y + source.x * sin + source.y * cos);
    out.rotation = tidy((source.rotation ?? 0) + rotation);
    out.properties = {
      ...(source.properties ?? {}),
      [PREFAB_PROPS.prefab]: prefab.name,
      [PREFAB_PROPS.instance]: instanceId,
      [PREFAB_PROPS.index]: index,
    };
    return out;
  });
}

type TiledProperty = { name: string; type?: string; value?: unknown };
type TiledObject = Record<string, unknown> & { id?: number; properties?: TiledProperty[] };

function inferType(value: LevelPropertyValue): string {
  return typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string';
}

/** The `midnite.prefabOverrides` list of an object: dotted field names, e.g. `width` or `properties.speed`. */
export function prefabOverrides(properties: readonly TiledProperty[] | undefined): string[] {
  const raw = properties?.find((p) => p.name === PREFAB_PROPS.overrides)?.value;
  return typeof raw === 'string' ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Bring every baked instance of `prefab` in `level` up to date. Each object's own `x`, `y` and `rotation` stay (an
 * instance is positioned); every other field is overwritten from the prefab object at its `midnite.prefabIndex`,
 * except those named in `midnite.prefabOverrides` (a field like `width`, or `properties.<name>`), which keep the
 * instance's value and count in `skippedFields`. The input is not mutated. An instance object whose index no longer
 * exists in the prefab is left alone.
 */
export function updateInstances(level: unknown, prefab: GamePrefab): { level: Record<string, unknown>; updated: number; skippedFields: number } {
  const map = structuredClone(level) as Record<string, unknown> & { layers?: Array<{ type?: string; objects?: TiledObject[] }> };
  let updated = 0;
  let skippedFields = 0;
  for (const layer of map.layers ?? []) {
    if (layer.type !== 'objectgroup') continue;
    for (const object of layer.objects ?? []) {
      const props = object.properties ?? [];
      const tagged = props.find((p) => p.name === PREFAB_PROPS.prefab)?.value;
      if (tagged !== prefab.name) continue;
      const index = props.find((p) => p.name === PREFAB_PROPS.index)?.value;
      const source = typeof index === 'number' ? prefab.objects[index] : undefined;
      if (!source) continue;
      const overridden = new Set(prefabOverrides(props));
      const take = (field: string): boolean => {
        if (overridden.has(field)) {
          skippedFields += 1;
          return false;
        }
        return true;
      };
      if (take('type')) object.type = source.type;
      if (source.name !== undefined && take('name')) object.name = source.name;
      if (source.width !== undefined && take('width')) object.width = source.width;
      if (source.height !== undefined && take('height')) object.height = source.height;
      if (take('point')) {
        if (source.point) object.point = true;
        else delete object.point;
      }
      if (source.polyline !== undefined && take('polyline')) object.polyline = source.polyline.map((p) => ({ ...p }));
      const next = [...props];
      for (const [name, value] of Object.entries(source.properties ?? {})) {
        if (!take(`properties.${name}`)) continue;
        const at = next.findIndex((p) => p.name === name);
        if (at >= 0) next[at] = { ...next[at]!, value };
        else next.push({ name, type: inferType(value), value });
      }
      object.properties = next;
      updated += 1;
    }
  }
  return { level: map, updated, skippedFields };
}
