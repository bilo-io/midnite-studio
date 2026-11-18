import { z } from 'zod';

import {
  GAME_LEVEL_ENTITY_TYPES_2D,
  GAME_LEVEL_ENTITY_TYPES_3D,
  levelEntityToWorld,
  levelProperties,
  metresPerTile,
  parseGameLevel,
} from './game-level';
import { LevelEntityFieldsSchema, type LevelEntityFields, type LevelPropertyValue } from './game-level-entity';
import { instantiatePrefab, type GamePrefab } from './game-level-prefab';

/**
 * Level operations (Phase 138 Theme A): the one op language for agent edits to a Tiled level. Pure and zod-only,
 * so main (a closed editor: apply, then one commit) and the renderer (an open editor: apply, then one undo step)
 * run byte-identical semantics. A batch is a transaction: every op is checked against the level as the previous
 * ops left it, and a single failure returns `ok: false` with the input untouched.
 *
 * Phase 139+ extend {@link LevelOpSchema} and `ctx.entityTypes` rather than adding parallel write paths.
 */

/** The most ops one batch may carry. */
export const LEVEL_OPS_MAX = 500;
/** Errors collected before a failed batch stops reporting. */
export const LEVEL_OP_ERRORS_MAX = 20;

export { LevelEntityFieldsSchema, LevelPropertyValueSchema, type LevelEntityFields, type LevelPropertyValue } from './game-level-entity';
const finite = z.number().finite();

export const LevelOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    entity: LevelEntityFieldsSchema,
    /** A layer id (number) or name (string); default the first object layer. */
    layer: z.union([z.number().int(), z.string().min(1)]).optional(),
    /** A caller label; `refs[ref]` in the result is the new id. */
    ref: z.string().min(1).max(64).optional(),
  }),
  z.object({
    op: z.literal('update'),
    id: z.number().int().positive(),
    set: LevelEntityFieldsSchema.partial().default({}),
    /** Property names to remove. */
    unset: z.array(z.string()).max(64).optional(),
  }),
  z.object({ op: z.literal('delete'), id: z.number().int().positive() }),
  /**
   * Phase 139 Theme I: stamp a prefab. `x`/`y` are the pivot in the batch's unit; the prefab's own offsets are px.
   * The objects are tagged as one instance (`instance` is an 8-char id, generated when absent) and `refs[ref]` is
   * the first object's id.
   */
  z.object({
    op: z.literal('place-prefab'),
    prefab: z.string().min(1).max(200),
    x: finite,
    y: finite,
    rotation: finite.optional(),
    layer: z.union([z.number().int(), z.string().min(1)]).optional(),
    instance: z.string().min(1).max(16).optional(),
    ref: z.string().min(1).max(64).optional(),
  }),
]);
export type LevelOp = z.infer<typeof LevelOpSchema>;

export type LevelOpsContext = {
  unit: 'px' | 'm';
  entityTypes: readonly string[];
  /** The prefabs `place-prefab` may name, by name (main reads them from disk, the renderer from its prefab list). */
  prefabs?: Readonly<Record<string, GamePrefab>>;
};
export type LevelOpError = { index: number; op: LevelOp['op']; message: string };
export type LevelOpsResult =
  | { ok: true; level: Record<string, unknown>; added: number[]; updated: number[]; deleted: number[]; refs: Record<string, number> }
  | { ok: false; errors: LevelOpError[] };

/** The entity types a level accepts: the 3D palette for a 3D level, the 2D one otherwise. */
export function levelEntityTypes(level: unknown): readonly string[] {
  const parsed = parseGameLevel(level);
  return parsed.ok && parsed.dimension === '3d' ? GAME_LEVEL_ENTITY_TYPES_3D : GAME_LEVEL_ENTITY_TYPES_2D;
}

type TiledProperty = { name: string; type?: string; value?: unknown };
type TiledObject = Record<string, unknown> & { id: number; x: number; y: number; properties?: TiledProperty[] };
type TiledLayer = Record<string, unknown> & { id?: number; type: string; name?: string; objects?: TiledObject[] };
type TiledMap = Record<string, unknown> & { width: number; height: number; tilewidth: number; tileheight: number; layers: TiledLayer[] };

/** Tiled's own inference for a property it has no declared type for. */
function inferType(value: LevelPropertyValue): string {
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  return 'string';
}

function mergeProperties(existing: TiledProperty[] | undefined, set: Record<string, LevelPropertyValue> | undefined, unset: readonly string[] | undefined): TiledProperty[] | undefined {
  let list = [...(existing ?? [])];
  for (const [name, value] of Object.entries(set ?? {})) {
    const at = list.findIndex((p) => p.name === name);
    if (at >= 0) list[at] = { ...list[at]!, value };
    else list.push({ name, type: inferType(value), value });
  }
  if (unset?.length) list = list.filter((p) => !unset.includes(p.name));
  return list.length || existing ? list : undefined;
}

function* objectsOf(map: TiledMap): Generator<{ layer: TiledLayer; object: TiledObject }> {
  for (const layer of map.layers) if (layer.type === 'objectgroup') for (const object of layer.objects ?? []) yield { layer, object };
}

function findObject(map: TiledMap, id: number): { layer: TiledLayer; index: number } | null {
  for (const layer of map.layers) {
    if (layer.type !== 'objectgroup') continue;
    const index = (layer.objects ?? []).findIndex((o) => o.id === id);
    if (index >= 0) return { layer, index };
  }
  return null;
}

function resolveLayer(map: TiledMap, target: number | string | undefined): TiledLayer | string {
  if (target === undefined) return map.layers.find((l) => l.type === 'objectgroup') ?? 'The level has no object layer to add to.';
  const layer = map.layers.find((l, i) => (typeof target === 'number' ? (l.id ?? i + 1) === target : l.name === target));
  if (!layer) return `No layer ${typeof target === 'number' ? `with id ${target}` : `named "${target}"`}.`;
  if (layer.type !== 'objectgroup') return `Layer "${layer.name ?? target}" is a ${layer.type}, not an object layer.`;
  return layer;
}

/** Metres to pixels on each axis (the inverse of `levelEntityToWorld`'s plan mapping). */
function scalers(map: TiledMap, unit: 'px' | 'm'): { sx: (v: number) => number; sy: (v: number) => number } {
  if (unit === 'px') return { sx: (v) => v, sy: (v) => v };
  const mpt = metresPerTile(map as { properties?: TiledProperty[] });
  return { sx: (v) => (v / mpt) * map.tilewidth, sy: (v) => (v / mpt) * map.tileheight };
}

function nextId(map: TiledMap): number {
  let max = 0;
  for (const { object } of objectsOf(map)) max = Math.max(max, object.id);
  const declared = typeof map.nextobjectid === 'number' ? map.nextobjectid : 1;
  return Math.max(declared, max + 1);
}

/** Append `entity` to `layer` as a new Tiled object, scaling its lengths with `sx`/`sy`; returns the new id. */
function pushObject(map: TiledMap, layer: TiledLayer, entity: LevelEntityFields, sx: (v: number) => number, sy: (v: number) => number): number {
  const id = nextId(map);
  const object: TiledObject = {
    id,
    name: entity.name ?? '',
    type: entity.type,
    x: sx(entity.x),
    y: sy(entity.y),
    width: entity.width === undefined ? 0 : sx(entity.width),
    height: entity.height === undefined ? 0 : sy(entity.height),
    rotation: entity.rotation ?? 0,
    visible: true,
  };
  if (entity.point) object.point = true;
  if (entity.polyline) object.polyline = entity.polyline.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
  const properties = mergeProperties(undefined, entity.properties, undefined);
  if (properties?.length) object.properties = properties;
  (layer.objects ??= []).push(object);
  map.nextobjectid = id + 1;
  return id;
}

/**
 * Apply `ops` to a copy of `level`. The input is never mutated (it may be frozen). All-or-nothing: on any error
 * the result is `{ ok: false, errors }` (at most {@link LEVEL_OP_ERRORS_MAX}) and no level is returned.
 */
export function applyLevelOps(level: unknown, ops: readonly LevelOp[], ctx: LevelOpsContext): LevelOpsResult {
  const parsed = parseGameLevel(level);
  if (!parsed.ok) {
    return { ok: false, errors: [{ index: -1, op: 'add', message: `The level does not parse: ${parsed.issues[0]?.message ?? 'unknown error'}` }] };
  }
  if (ops.length > LEVEL_OPS_MAX) return { ok: false, errors: [{ index: LEVEL_OPS_MAX, op: ops[LEVEL_OPS_MAX]!.op, message: `A batch holds at most ${LEVEL_OPS_MAX} operations.` }] };

  const map = structuredClone(level) as TiledMap;
  const { sx, sy } = scalers(map, ctx.unit);
  const errors: LevelOpError[] = [];
  const added: number[] = [];
  const updated: number[] = [];
  const deleted: number[] = [];
  const refs: Record<string, number> = {};
  const mapW = map.width * map.tilewidth;
  const mapH = map.height * map.tileheight;

  const fail = (index: number, op: LevelOp['op'], message: string): void => {
    if (errors.length < LEVEL_OP_ERRORS_MAX) errors.push({ index, op, message });
  };
  const checkType = (type: string): string | null =>
    ctx.entityTypes.includes(type) ? null : `Unknown type "${type}". Allowed types: ${ctx.entityTypes.join(', ')}.`;
  const checkPos = (axis: 'x' | 'y', px: number): string | null => {
    const size = axis === 'x' ? mapW : mapH;
    return px < -size || px > 2 * size ? `${axis} = ${px} is outside the level.` : null;
  };

  ops.forEach((op, index) => {
    if (errors.length >= LEVEL_OP_ERRORS_MAX) return;
    if (op.op === 'place-prefab') {
      const prefab = ctx.prefabs?.[op.prefab];
      if (!prefab) return fail(index, 'place-prefab', `No prefab named "${op.prefab}" — \`game_prefab_list\` returns the names.`);
      if (prefab.dimension !== parsed.dimension) return fail(index, 'place-prefab', `Prefab "${op.prefab}" is ${prefab.dimension}; this level is ${parsed.dimension}.`);
      const layer = resolveLayer(map, op.layer);
      if (typeof layer === 'string') return fail(index, 'place-prefab', layer);
      if (op.ref !== undefined && op.ref in refs) return fail(index, 'place-prefab', `Ref "${op.ref}" is already used in this batch.`);
      const at = { x: sx(op.x), y: sy(op.y) };
      const instance = op.instance ?? globalThis.crypto.randomUUID().slice(0, 8);
      const entities = instantiatePrefab(prefab, at, op.rotation ?? 0, instance);
      for (const entity of entities) {
        const problem = checkType(entity.type) ?? checkPos('x', entity.x) ?? checkPos('y', entity.y);
        if (problem) return fail(index, 'place-prefab', `${problem} (in prefab "${op.prefab}")`);
      }
      entities.forEach((entity, at2) => {
        const id = pushObject(map, layer, entity, (v) => v, (v) => v);
        added.push(id);
        if (at2 === 0 && op.ref) refs[op.ref] = id;
      });
      return;
    }
    if (op.op === 'add') {
      const { entity } = op;
      const problem = (op.ref !== undefined && op.ref in refs ? `Ref "${op.ref}" is already used in this batch.` : null) ?? checkType(entity.type) ?? checkPos('x', sx(entity.x)) ?? checkPos('y', sy(entity.y));
      if (problem) return fail(index, 'add', problem);
      const layer = resolveLayer(map, op.layer);
      if (typeof layer === 'string') return fail(index, 'add', layer);
      const id = pushObject(map, layer, entity, sx, sy);
      added.push(id);
      if (op.ref) refs[op.ref] = id;
      return;
    }
    const found = findObject(map, op.id);
    if (!found) return fail(index, op.op, `No object with id ${op.id}.`);
    const objects = found.layer.objects!;
    if (op.op === 'delete') {
      objects.splice(found.index, 1);
      deleted.push(op.id);
      return;
    }
    const { set } = op;
    const object = objects[found.index]!;
    const problem =
      (set.type !== undefined ? checkType(set.type) : null) ??
      (set.x !== undefined ? checkPos('x', sx(set.x)) : null) ??
      (set.y !== undefined ? checkPos('y', sy(set.y)) : null);
    if (problem) return fail(index, 'update', problem);
    if (set.type !== undefined) object.type = set.type;
    if (set.name !== undefined) object.name = set.name;
    if (set.x !== undefined) object.x = sx(set.x);
    if (set.y !== undefined) object.y = sy(set.y);
    if (set.width !== undefined) object.width = sx(set.width);
    if (set.height !== undefined) object.height = sy(set.height);
    if (set.rotation !== undefined) object.rotation = set.rotation;
    if (set.point !== undefined) {
      if (set.point) object.point = true;
      else delete object.point;
    }
    if (set.polyline !== undefined) object.polyline = set.polyline.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    if (set.properties !== undefined || op.unset?.length) {
      const next = mergeProperties(object.properties, set.properties, op.unset);
      if (next) object.properties = next;
      else delete object.properties;
    }
    if (!updated.includes(op.id)) updated.push(op.id);
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, level: map, added, updated, deleted, refs };
}

// --- Query -----------------------------------------------------------------------

export const LevelQuerySchema = z.object({
  types: z.array(z.string()).max(32).optional(),
  layer: z.union([z.number().int(), z.string()]).optional(),
  ids: z.array(z.number().int()).max(1000).optional(),
  /** Case-insensitive substring. */
  name: z.string().max(200).optional(),
  /** An object matches when its centre is inside. In `unit`. */
  region: z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }).optional(),
  unit: z.enum(['px', 'm']).default('px'),
  limit: z.number().int().min(1).max(1000).default(200),
});
export type LevelQuery = z.input<typeof LevelQuerySchema>;

export type LevelObjectSummary = {
  id: number;
  layerId: number;
  layer: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  point?: boolean;
  properties: Record<string, string | number | boolean>;
  /** Metres, 3D levels only (`levelEntityToWorld`). */
  world?: { x: number; y: number; z: number };
};

/** Objects matching `query`, in layer then object order. Coordinates come back in `query.unit`. */
export function queryLevel(level: unknown, query: z.input<typeof LevelQuerySchema>): { total: number; truncated: boolean; objects: LevelObjectSummary[] } {
  const parsed = parseGameLevel(level);
  if (!parsed.ok) return { total: 0, truncated: false, objects: [] };
  const q = LevelQuerySchema.parse(query);
  const map = parsed.level as unknown as TiledMap;
  const three = parsed.dimension === '3d';
  const mpt = metresPerTile(map as { properties?: TiledProperty[] });
  const outX = (px: number): number => (q.unit === 'm' ? (px / map.tilewidth) * mpt : px);
  const outY = (px: number): number => (q.unit === 'm' ? (px / map.tileheight) * mpt : px);
  const inX = (v: number): number => (q.unit === 'm' ? (v / mpt) * map.tilewidth : v);
  const inY = (v: number): number => (q.unit === 'm' ? (v / mpt) * map.tileheight : v);
  const needle = q.name?.toLowerCase();
  const region = q.region && { x0: inX(q.region.x), y0: inY(q.region.y), x1: inX(q.region.x + q.region.width), y1: inY(q.region.y + q.region.height) };

  let total = 0;
  const objects: LevelObjectSummary[] = [];
  map.layers.forEach((layer, layerIndex) => {
    if (layer.type !== 'objectgroup') return;
    const layerId = layer.id ?? layerIndex + 1;
    if (q.layer !== undefined && (typeof q.layer === 'number' ? layerId !== q.layer : layer.name !== q.layer)) return;
    for (const object of layer.objects ?? []) {
      const type = typeof object.type === 'string' && object.type ? object.type : typeof object.class === 'string' ? object.class : '';
      const name = typeof object.name === 'string' ? object.name : '';
      if (q.types && !q.types.includes(type)) continue;
      if (q.ids && !q.ids.includes(object.id)) continue;
      if (needle !== undefined && !name.toLowerCase().includes(needle)) continue;
      const w = typeof object.width === 'number' ? object.width : 0;
      const h = typeof object.height === 'number' ? object.height : 0;
      if (region) {
        const cx = object.x + w / 2;
        const cy = object.y + h / 2;
        if (cx < region.x0 || cx > region.x1 || cy < region.y0 || cy > region.y1) continue;
      }
      total += 1;
      if (objects.length >= q.limit) continue;
      const props: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(levelProperties(object))) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') props[k] = v;
      const summary: LevelObjectSummary = { id: object.id, layerId, layer: layer.name ?? '', type, name, x: outX(object.x), y: outY(object.y), properties: props };
      if (typeof object.width === 'number') summary.width = outX(object.width);
      if (typeof object.height === 'number') summary.height = outY(object.height);
      if (typeof object.rotation === 'number') summary.rotation = object.rotation;
      if (object.point === true) summary.point = true;
      if (three) {
        const [x, , z] = levelEntityToWorld(object as Parameters<typeof levelEntityToWorld>[0], map).position;
        summary.world = { x, y: 0, z };
        const elevation = props.elevation;
        if (typeof elevation === 'number') summary.world.y = elevation;
      }
      objects.push(summary);
    }
  });
  return { total, truncated: total > objects.length, objects };
}

// --- play-from start point (Phase 140 Theme H) -------------------------------------------

/** Where `game_play_from` starts, in the kit's `midnite-spawn` shape: 2D `{x, y}` px; 3D `{x, y}` = x,z or `{x, y, z}` = x,height,z metres. */
export type PlayFromSpawn = { x: number; y: number; z?: number };

/**
 * The start point for `game_play_from`. `objectId` wins: the object's position (a 2D rectangle's centre in px; a 3D
 * object through `levelEntityToWorld`, in metres, with its `elevation` as the height when it has one). Else `at` in
 * `unit` (`x`, `y` = the plan position; `z` = the height above ground, 3D only). Neither: `null` (the scene's own spawn).
 * A missing object or an unreadable level answers `{ error }`.
 */
export function resolvePlayFromSpawn(
  level: unknown,
  input: { at?: { x: number; y: number; z?: number } | undefined; objectId?: number | undefined; unit?: 'px' | 'm' | undefined },
): { spawn: PlayFromSpawn | null } | { error: string } {
  if (input.at === undefined && input.objectId === undefined) return { spawn: null };
  const parsed = parseGameLevel(level);
  if (!parsed.ok) return { error: 'That level could not be read.' };
  const map = parsed.level as unknown as TiledMap;
  const three = parsed.dimension === '3d';
  if (input.objectId !== undefined) {
    for (const { object } of objectsOf(map)) {
      if (object.id !== input.objectId) continue;
      if (three) {
        const [x, elevation, z] = levelEntityToWorld(object as Parameters<typeof levelEntityToWorld>[0], map).position;
        return { spawn: elevation === null ? { x, y: z } : { x, y: elevation, z } };
      }
      const w = typeof object.width === 'number' ? object.width : 0;
      const h = typeof object.height === 'number' ? object.height : 0;
      return { spawn: { x: object.x + w / 2, y: object.y + h / 2 } };
    }
    return { error: `The level has no object with id ${input.objectId}.` };
  }
  const at = input.at as { x: number; y: number; z?: number | undefined };
  const mpt = metresPerTile(map as { properties?: TiledProperty[] });
  const metres = (input.unit ?? 'px') === 'm';
  if (three) {
    const x = metres ? at.x : (at.x / map.tilewidth) * mpt;
    const planZ = metres ? at.y : (at.y / map.tileheight) * mpt;
    return { spawn: at.z === undefined ? { x, y: planZ } : { x, y: at.z, z: planZ } };
  }
  return { spawn: metres ? { x: (at.x / mpt) * map.tilewidth, y: (at.y / mpt) * map.tileheight } : { x: at.x, y: at.y } };
}
