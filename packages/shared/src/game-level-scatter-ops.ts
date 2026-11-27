import { LEVEL_OPS_MAX, type LevelOp, type LevelOpSnap } from './game-level-ops';
import { PREFAB_PROPS } from './game-level-prefab';
import { ScatterOptionsSchema, scatterPoints, type ScatterArea, type ScatterOptions, type ScatterSource } from './game-level-scatter';

/**
 * `game_level_scatter` (Phase 139 Theme I): the sampler's points as a batch of ordinary level ops, so a scatter
 * is applied by the same all-or-nothing write path as `game_entity_batch` (one undo step in an open editor, one
 * commit otherwise). Pure: `existing` objects are read from the raw Tiled level, like the brush's own spacing rule.
 */
type RawProperty = { name?: unknown; value?: unknown };
type RawObject = { type?: unknown; x?: unknown; y?: unknown; properties?: RawProperty[] };

const propOf = (o: RawObject, name: string): unknown => o.properties?.find((p) => p.name === name)?.value;

function matches(o: RawObject, source: ScatterSource): boolean {
  if (source.kind === 'model') return o.type === 'prop' && propOf(o, 'model') === source.name;
  if (source.kind === 'prefab') return propOf(o, PREFAB_PROPS.prefab) === source.name;
  return o.type === source.type;
}

/** Each source object once; a prefab instance counts at its first part. */
export function existingScatterPoints(level: unknown, sources: readonly ScatterSource[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const layers = (level as { layers?: Array<{ type?: string; objects?: RawObject[] }> } | null)?.layers ?? [];
  for (const layer of layers) {
    if (layer.type !== 'objectgroup') continue;
    for (const o of layer.objects ?? []) {
      const source = sources.find((s) => matches(o, s));
      if (!source || typeof o.x !== 'number' || typeof o.y !== 'number') continue;
      if (source.kind === 'prefab' && Number(propOf(o, PREFAB_PROPS.index) ?? 0) !== 0) continue;
      out.push({ x: o.x, y: o.y });
    }
  }
  return out;
}

const round = (v: number, places: number): number => Math.round(v * 10 ** places) / 10 ** places;

/**
 * The ops that scatter `options.sources` over `area` (px). At most {@link LEVEL_OPS_MAX} ops come back (a prefab point
 * is one op); `capped` says the points were cut to fit. `existing` defaults to the matching objects already in `level`.
 */
export function scatterOps(args: {
  level: unknown;
  area: ScatterArea;
  options: ScatterOptions;
  layer?: number | string | undefined;
  instanceId?: () => string;
  /** Phase 141 Theme G: every op carries this snap. */
  snap?: LevelOpSnap | undefined;
}): { ops: LevelOp[]; points: number; capped: boolean } {
  const { level, area, layer } = args;
  const options = ScatterOptionsSchema.parse(args.options);
  const sources = options.sources;
  const all = scatterPoints(area, options, existingScatterPoints(level, sources));
  const capped = all.length > LEVEL_OPS_MAX;
  const ops: LevelOp[] = [];
  for (const p of all.slice(0, LEVEL_OPS_MAX)) {
    const source = sources[p.source]!;
    const where = { ...(layer === undefined ? {} : { layer }), ...(args.snap ? { snap: args.snap } : {}) };
    const x = round(p.x, 2);
    const y = round(p.y, 2);
    const rotation = round(p.rotation, 2);
    if (source.kind === 'prefab') {
      ops.push({ op: 'place-prefab', prefab: source.name, x, y, rotation, ...where, ...(args.instanceId ? { instance: args.instanceId() } : {}) });
      continue;
    }
    const properties: Record<string, string | number> = source.kind === 'model' ? { model: source.name } : {};
    if (Math.abs(p.scale - 1) > 1e-9) properties.scale = round(p.scale, 3);
    ops.push({
      op: 'add',
      entity: {
        type: source.kind === 'model' ? 'prop' : source.type,
        name: source.kind === 'model' ? source.name.replace(/\.[^.]+$/, '') || source.name : '',
        x,
        y,
        rotation,
        point: true,
        ...(Object.keys(properties).length ? { properties } : {}),
      },
      ...where,
    });
  }
  return { ops, points: all.length, capped };
}
