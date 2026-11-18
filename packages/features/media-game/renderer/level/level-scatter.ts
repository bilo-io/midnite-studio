/**
 * The scatter brush's edit ops (Phase 139 Theme H), pure over {@link EditState}. A dab asks the shared sampler
 * (`scatterPoints`, also the MCP op's) for points around the cursor and inserts them in ONE `insertObjects` call;
 * called between `beginStroke` and `endStroke`, a whole stroke is one undo step. `Alt` erases instead.
 */
import {
  SCATTER_STROKE_CAP,
  instantiatePrefab,
  scatterPoints,
  type GamePrefab,
  type ScatterOptionsParsed,
  type ScatterSource,
} from '@midnite/studio-shared';

import {
  deleteObjects,
  entityToObject,
  insertObjects,
  instanceRefs,
  prefabInstanceOf,
  type EditLevel,
  type EditState,
  type LevelObject,
  type ObjectRef,
} from './level-edit-model';

/** What the options panel edits: {@link ScatterOptions} minus the fixed-per-stroke bits. */
export type ScatterSettings = ScatterOptionsParsed;

export const DEFAULT_SCATTER: Omit<ScatterSettings, 'sources' | 'seed'> = { radius: 120, density: 2, spacing: 16, scale: [0.8, 1.2], rotation: [0, 360] };
export const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

const propOf = (o: Pick<LevelObject, 'properties'>, name: string): unknown => o.properties?.find((p) => p.name === name)?.value;

/** True when `o` was made by (or is) `source`. */
export function matchesSource(o: LevelObject, source: ScatterSource): boolean {
  if (source.kind === 'model') return o.type === 'prop' && propOf(o, 'model') === source.name;
  if (source.kind === 'prefab') return prefabInstanceOf(o)?.prefab === source.name;
  return o.type === source.type;
}

/** Each source object on the level, once: a prefab instance counts at its first object, not at every part. */
function existingOf(level: EditLevel, sources: readonly ScatterSource[]): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const layer of level.layers) {
    if (layer.type !== 'objectgroup') continue;
    for (const o of layer.objects ?? []) {
      const source = sources.find((s) => matchesSource(o, s));
      if (!source) continue;
      if (source.kind === 'prefab' && (prefabInstanceOf(o)?.index ?? 0) !== 0) continue;
      out.push({ x: o.x, y: o.y });
    }
  }
  return out;
}

const newInstanceId = () => crypto.randomUUID().slice(0, 8);

/** The object a scattered model or type becomes; scale is `properties.scale`, rotation is `rotation`. */
function pointObject(source: Exclude<ScatterSource, { kind: 'prefab' }>, p: { x: number; y: number; scale: number; rotation: number }): Omit<LevelObject, 'id'> {
  const properties: NonNullable<LevelObject['properties']> = source.kind === 'model' ? [{ name: 'model', type: 'string', value: source.name }] : [];
  if (Math.abs(p.scale - 1) > 1e-9) properties.push({ name: 'scale', type: 'float', value: Math.round(p.scale * 1000) / 1000 });
  return {
    name: source.kind === 'model' ? source.name.replace(/\.[^.]+$/, '') || source.name : '',
    type: source.kind === 'model' ? 'prop' : source.type,
    x: Math.round(p.x * 100) / 100,
    y: Math.round(p.y * 100) / 100,
    width: 0,
    height: 0,
    rotation: Math.round(p.rotation * 100) / 100,
    visible: true,
    point: true,
    properties,
  };
}

export type DabResult = { state: EditState; added: number; capped: boolean };

/**
 * One dab at `at` on `layerId`. `dab` is the stroke's dab counter: it offsets the seed so successive dabs differ
 * yet the stroke stays reproducible. `room` is how many more stamps the stroke may add (the 2,000 cap). A prefab
 * source whose file is not in `prefabs` is skipped; a prefab stamp ignores the scale jitter (its objects keep
 * their authored sizes) but takes the rotation, and gets its own instance id.
 */
export function scatterDab(
  state: EditState,
  args: { layerId: number; at: { x: number; y: number }; options: ScatterSettings; prefabs: ReadonlyMap<string, GamePrefab>; dab: number; room: number },
): DabResult {
  const { layerId, at, options, prefabs, dab } = args;
  const room = Math.min(args.room, SCATTER_STROKE_CAP);
  if (room <= 0) return { state, added: 0, capped: true };
  const usable = options.sources.filter((s) => s.kind !== 'prefab' || prefabs.has(s.name));
  if (usable.length === 0) return { state, added: 0, capped: false };
  const opts = { ...options, sources: usable, seed: (options.seed + dab * 7919) % 2 ** 31 };
  const all = scatterPoints({ cx: at.x, cy: at.y, radius: options.radius }, opts, existingOf(state.level, usable));
  const points = all.slice(0, room);
  const items: Array<{ layerId: number; object: Omit<LevelObject, 'id'> }> = [];
  for (const p of points) {
    const source = usable[p.source]!;
    if (source.kind === 'prefab') {
      for (const e of instantiatePrefab(prefabs.get(source.name)!, { x: p.x, y: p.y }, p.rotation, newInstanceId())) items.push({ layerId, object: entityToObject(e) });
    } else items.push({ layerId, object: pointObject(source, p) });
  }
  const inserted = insertObjects(state, items);
  // A stroke does not select what it scatters (thousands of objects): the selection stays as it was.
  const next = inserted === state ? state : { ...inserted, selection: state.selection, selected: state.selected };
  return { state: next, added: points.length, capped: points.length >= room };
}

/** `Alt`: delete every object made by one of `sources` whose position is inside the brush; a prefab instance goes whole. */
export function eraseDab(state: EditState, args: { at: { x: number; y: number }; radius: number; sources: readonly ScatterSource[] }): EditState {
  const { at, radius, sources } = args;
  const refs = new Map<string, ObjectRef>();
  for (const layer of state.level.layers) {
    if (layer.type !== 'objectgroup' || typeof layer.id !== 'number') continue;
    for (const o of layer.objects ?? []) {
      if (!sources.some((s) => matchesSource(o, s)) || (o.x - at.x) ** 2 + (o.y - at.y) ** 2 > radius * radius) continue;
      const ref = { layerId: layer.id, objectId: o.id };
      for (const r of prefabInstanceOf(o) ? instanceRefs(state.level, ref) : [ref]) refs.set(`${r.layerId}:${r.objectId}`, r);
    }
  }
  return refs.size ? deleteObjects(state, [...refs.values()]) : state;
}

