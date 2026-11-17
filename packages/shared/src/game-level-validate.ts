import { GAME_LEVEL_PROPS, levelProperties, parseGameLevel, type GameLevel } from './game-level';

/**
 * The level validator (Phase 138 Theme B): deterministic problems an agent (or the editor) should know about.
 * Rules are a registry, {@link LEVEL_RULES}; Phase 142 appends to it (and widens {@link LevelRuleId}).
 * Output order is fixed (severity, rule id, object id, message), so the same level always yields the same list.
 */

export type LevelIssueSeverity = 'error' | 'warning' | 'info';
export type LevelRuleId =
  | 'level/parse'
  | 'level/no-spawn'
  | 'level/duplicate-id'
  | 'level/unknown-type'
  | 'level/out-of-bounds'
  | 'level/bad-size'
  | 'level/missing-model';
export type LevelIssue = { rule: LevelRuleId; severity: LevelIssueSeverity; message: string; objectId?: number; layerId?: number };
export type LevelValidateContext = {
  /** Types the level accepts (`levelEntityTypes`, widened by Phase 142). */
  entityTypes: readonly string[];
  /** Names of the game's `model` assets; `null` means not checked. */
  modelAssets: readonly string[] | null;
};
export type LevelRule = { id: LevelRuleId; run: (level: GameLevel, ctx: LevelValidateContext) => LevelIssue[] };

/** The most issues one run returns. */
export const LEVEL_ISSUES_MAX = 500;

type Obj = { id: number; x: number; y: number; width?: number; height?: number; type?: unknown; class?: unknown; properties?: Array<{ name: string; value?: unknown }> };

type Placed = { object: Obj; layerId: number; type: string };

function placed(level: GameLevel): Placed[] {
  const out: Placed[] = [];
  level.layers.forEach((layer, i) => {
    if (layer.type !== 'objectgroup') return;
    for (const raw of layer.objects ?? []) {
      const object = raw as Obj;
      const type = typeof object.type === 'string' && object.type ? object.type : typeof object.class === 'string' ? object.class : '';
      out.push({ object, layerId: typeof (layer as { id?: unknown }).id === 'number' ? (layer as unknown as { id: number }).id : i + 1, type });
    }
  });
  return out;
}

const label = (p: Placed): string => `Object ${p.object.id}${p.type ? ` (${p.type})` : ''}`;

export const LEVEL_RULES: readonly LevelRule[] = [
  {
    id: 'level/no-spawn',
    run: (level) =>
      placed(level).some((p) => p.type === 'spawn')
        ? []
        : [{ rule: 'level/no-spawn', severity: 'error', message: 'The level has no spawn object, so a player has nowhere to start.' }],
  },
  {
    id: 'level/duplicate-id',
    run: (level) => {
      const counts = new Map<number, number>();
      for (const p of placed(level)) counts.set(p.object.id, (counts.get(p.object.id) ?? 0) + 1);
      return [...counts]
        .filter(([, n]) => n > 1)
        .map(([id, n]): LevelIssue => ({ rule: 'level/duplicate-id', severity: 'error', message: `Object id ${id} is used by ${n} objects.`, objectId: id }));
    },
  },
  {
    id: 'level/unknown-type',
    run: (level, ctx) =>
      placed(level)
        .filter((p) => !ctx.entityTypes.includes(p.type))
        .map((p): LevelIssue => ({
          rule: 'level/unknown-type',
          severity: 'warning',
          message: `${label(p)} has ${p.type ? `unknown type "${p.type}"` : 'no type'}; allowed types are ${ctx.entityTypes.join(', ')}.`,
          objectId: p.object.id,
          layerId: p.layerId,
        })),
  },
  {
    id: 'level/out-of-bounds',
    run: (level) => {
      const w = level.width * level.tilewidth;
      const h = level.height * level.tileheight;
      return placed(level)
        .filter(({ object: o }) => {
          const cx = o.x + (o.width ?? 0) / 2;
          const cy = o.y + (o.height ?? 0) / 2;
          return cx < 0 || cx > w || cy < 0 || cy > h;
        })
        .map((p): LevelIssue => ({ rule: 'level/out-of-bounds', severity: 'warning', message: `${label(p)} is outside the level.`, objectId: p.object.id, layerId: p.layerId }));
    },
  },
  {
    id: 'level/bad-size',
    run: (level) =>
      placed(level)
        .filter(({ object: o }) => [o.width, o.height].some((v) => v !== undefined && (!Number.isFinite(v) || v < 0)))
        .map((p): LevelIssue => ({ rule: 'level/bad-size', severity: 'error', message: `${label(p)} has a negative or invalid size.`, objectId: p.object.id, layerId: p.layerId })),
  },
  {
    id: 'level/missing-model',
    run: (level, ctx) => {
      if (ctx.modelAssets === null || levelProperties(level)[GAME_LEVEL_PROPS.dimension] !== '3d') return [];
      const known = new Set(ctx.modelAssets.flatMap((a) => [a, a.replace(/\.[^./]+$/, '')]));
      const issues: LevelIssue[] = [];
      for (const p of placed(level)) {
        const model = levelProperties(p.object).model;
        if (typeof model === 'string' && model !== '' && !known.has(model)) {
          issues.push({ rule: 'level/missing-model', severity: 'error', message: `${label(p)} uses model "${model}", which is not a model asset.`, objectId: p.object.id, layerId: p.layerId });
        }
      }
      return issues;
    },
  },
];

const SEVERITY_ORDER: Record<LevelIssueSeverity, number> = { error: 0, warning: 1, info: 2 };
const cmp = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0);

/** Never throws. Sorted by severity, rule id, object id (ascending, none first), message; capped at {@link LEVEL_ISSUES_MAX}. */
export function validateLevel(level: unknown, ctx: LevelValidateContext): LevelIssue[] {
  const parsed = parseGameLevel(level);
  const issues: LevelIssue[] = parsed.ok
    ? LEVEL_RULES.flatMap((rule) => rule.run(parsed.level, ctx))
    : parsed.issues.map((i): LevelIssue => ({ rule: 'level/parse', severity: 'error', message: `The level does not parse: ${i.path}: ${i.message}` }));
  return issues
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        cmp(a.rule, b.rule) ||
        cmp(a.objectId ?? -1, b.objectId ?? -1) ||
        cmp(a.message, b.message) ||
        cmp(a.layerId ?? -1, b.layerId ?? -1),
    )
    .slice(0, LEVEL_ISSUES_MAX);
}
