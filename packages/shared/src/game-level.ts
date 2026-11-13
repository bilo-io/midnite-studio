import { z } from 'zod';

import { GameIdRequest, GameSceneNameSchema, type GameManifestIssue } from './media-game';

/**
 * Game levels (Phase 132 Theme C): a level is a Tiled JSON map, one file per scene at `levels/<scene>.tmj` in
 * the game's own repo. This module is the app's side of the format — how a map is read loosely (a map saved by
 * Tiled carries fields this app never writes, and they must round-trip), the map properties that say which
 * dimension a level is, and the 3D plan-view mapping the editor's inspector shows and the kit builds from.
 *
 * `GameSceneNameSchema` and `GAME_LEVEL_PARAM` live in `media-game.ts` (the manifest and the runner need them);
 * both reach the shared barrel from there.
 */
export const GAME_LEVELS_DIR = 'levels';
export const GAME_LEVEL_EXT = '.tmj';
export const GAME_LEVEL_MAX_BYTES = 4 * 1024 * 1024;
/** Embedded tileset images a `levelGet` answers with are capped together at this. */
export const GAME_LEVEL_IMAGES_MAX_BYTES = 8 * 1024 * 1024;

/** The entity palette the editor offers; custom types are allowed in the file. */
export const GAME_LEVEL_ENTITY_TYPES_2D = ['spawn', 'exit', 'enemy', 'pickup', 'hazard', 'checkpoint', 'trigger', 'npc'] as const;
export const GAME_LEVEL_ENTITY_TYPES_3D = ['spawn', 'exit', 'prop', 'enemy', 'pickup', 'light', 'checkpoint', 'trigger', 'npc', 'path'] as const;

export type GameLevelDimension = '2d' | '3d';

/** Map property names. */
export const GAME_LEVEL_PROPS = {
  level: 'midnite.level',
  dimension: 'midnite.dimension',
  metresPerTile: 'midnite.metresPerTile',
  terrain: 'midnite.terrain',
  groundY: 'midnite.groundY',
} as const;

const looseProperties = z.array(z.object({ name: z.string(), type: z.string().optional(), value: z.unknown() }).passthrough());

const LooseObject = z
  .object({
    id: z.number(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    rotation: z.number().optional(),
    properties: looseProperties.optional(),
  })
  .passthrough();

/** A layer: tile layers carry `data`, object groups `objects`; any other kind is kept untouched. */
const LooseLayer = z
  .object({ type: z.string(), name: z.string().optional(), data: z.array(z.number()).optional(), objects: z.array(LooseObject).optional(), properties: looseProperties.optional() })
  .passthrough()
  .superRefine((layer, ctx) => {
    if (layer.type === 'tilelayer' && !layer.data) ctx.addIssue({ code: 'custom', message: `Tile layer "${layer.name ?? ''}" has no data.` });
    if (layer.type === 'objectgroup' && !layer.objects) ctx.addIssue({ code: 'custom', message: `Object layer "${layer.name ?? ''}" has no objects.` });
  });

const LooseTileset = z
  .object({ name: z.string().optional(), source: z.string().optional() })
  .passthrough()
  .superRefine((tileset, ctx) => {
    if (tileset.source !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `Tileset "${tileset.name ?? tileset.source}" is external. Embed it (Tiled ▸ Map ▸ Embed Tileset) and save again.`,
      });
    }
  });

/** A loose read of a Tiled map: `.passthrough()` everywhere so fields this app never writes survive a round trip. */
export const GameLevelSchema = z
  .object({
    type: z.literal('map'),
    orientation: z.enum(['orthogonal', 'isometric']),
    infinite: z
      .boolean()
      .refine((v) => !v, 'Infinite maps are not supported. Turn off “Infinite” in the map’s properties in Tiled and save again.'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tilewidth: z.number().int().positive(),
    tileheight: z.number().int().positive(),
    layers: z.array(LooseLayer),
    tilesets: z.array(LooseTileset),
    properties: looseProperties.optional(),
  })
  .passthrough();
export type GameLevel = z.infer<typeof GameLevelSchema>;

export type GameLevelParse =
  | { ok: true; level: GameLevel; dimension: GameLevelDimension }
  | { ok: false; issues: GameManifestIssue[] };

/** A Tiled `properties` array as a name → value record (the first of a repeated name wins). */
export function levelProperties(level: { properties?: ReadonlyArray<{ name: string; value?: unknown }> | undefined }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of level.properties ?? []) if (!(p.name in out)) out[p.name] = p.value;
  return out;
}

/** Never throws — a level may be hand-edited or saved by Tiled. */
export function parseGameLevel(value: unknown): GameLevelParse {
  const parsed = GameLevelSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.') || '(root)', message: issue.message })) };
  }
  const level = parsed.data;
  return { ok: true, level, dimension: levelProperties(level)[GAME_LEVEL_PROPS.dimension] === '3d' ? '3d' : '2d' };
}

const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** `midnite.metresPerTile`, default 1; a non-positive value reads as 1. */
export function metresPerTile(level: { properties?: ReadonlyArray<{ name: string; value?: unknown }> | undefined }): number {
  const v = finite(levelProperties(level)[GAME_LEVEL_PROPS.metresPerTile], 1);
  return v > 0 ? v : 1;
}

/** The raw Tiled object fields {@link levelEntityToWorld} reads. */
export type LevelEntityInput = {
  x: number;
  y: number;
  width?: number | undefined;
  height?: number | undefined;
  rotation?: number | undefined;
  properties?: ReadonlyArray<{ name: string; value?: unknown }> | undefined;
};

export type LevelWorldPlacement = {
  /** Metres. `y` is `null` when the entity has no `elevation`: snap to the terrain or `midnite.groundY`. */
  position: [number, number | null, number];
  /** Radians, three's `rotation.y`: Tiled's clockwise-from-above `rotation` negated. */
  yaw: number;
  /** Radians. */
  pitch: number;
  roll: number;
  scale: number;
  /** Metres: footprint x, `sizeY` (default 3), footprint z. A point has a zero footprint. */
  size: [number, number, number];
};

const DEG = Math.PI / 180;

/**
 * Decision 3's mapping from a plan-view Tiled object to world metres: `worldX = x / tilewidth × mpt`,
 * `worldZ = y / tileheight × mpt`. A rectangle's position is its centre, computed with Tiled's rotation about
 * the object's own origin (clockwise on screen). The kit's `toWorld3d` is the same function in JS;
 * `kit-level.test.ts` pins them together.
 */
export function levelEntityToWorld(entity: LevelEntityInput, level: { tilewidth: number; tileheight: number; properties?: ReadonlyArray<{ name: string; value?: unknown }> | undefined }): LevelWorldPlacement {
  const mpt = metresPerTile(level);
  const props = levelProperties(entity);
  const w = finite(entity.width, 0);
  const h = finite(entity.height, 0);
  const rotation = finite(entity.rotation, 0);
  const theta = rotation * DEG;
  const cx = entity.x + (w / 2) * Math.cos(theta) - (h / 2) * Math.sin(theta);
  const cy = entity.y + (w / 2) * Math.sin(theta) + (h / 2) * Math.cos(theta);
  const elevation = props.elevation;
  return {
    position: [(cx / level.tilewidth) * mpt, typeof elevation === 'number' && Number.isFinite(elevation) ? elevation : null, (cy / level.tileheight) * mpt],
    yaw: -rotation * DEG,
    pitch: finite(props.pitch, 0) * DEG,
    roll: finite(props.roll, 0) * DEG,
    scale: finite(props.scale, 1),
    size: [(w / level.tilewidth) * mpt, finite(props.sizeY, 3), (h / level.tileheight) * mpt],
  };
}

// --- IPC ------------------------------------------------------------------------

const IssueSchema = z.object({ path: z.string(), message: z.string() });

export const GameLevelsRequestSchema = GameIdRequest;
export const GameLevelListEntrySchema = z.object({
  scene: z.string(),
  bytes: z.number().int().nonnegative(),
  dimension: z.enum(['2d', '3d']).nullable(),
  issue: z.string().nullable(),
});
export const GameLevelsResultSchema = z.object({
  scenes: z.array(GameLevelListEntrySchema),
  start: z.string().nullable(),
  readsLevels: z.boolean(),
});
export type GameLevelsResult = z.infer<typeof GameLevelsResultSchema>;

export const GameLevelGetRequestSchema = z.object({ gameId: z.string().min(1), scene: GameSceneNameSchema });
/** A 3D level's terrain, only as an extent: the pack's bounds in metres (X right, Z down) and its drape image when it carries one. */
export const GameLevelTerrainSchema = z.object({
  name: z.string(),
  minX: z.number(),
  minZ: z.number(),
  maxX: z.number(),
  maxZ: z.number(),
  preview: z.string().nullable(),
});
export type GameLevelTerrain = z.infer<typeof GameLevelTerrainSchema>;

export const GameLevelGetResultSchema = z.object({
  level: z.unknown(),
  issues: z.array(IssueSchema),
  images: z.array(z.object({ path: z.string(), dataUrl: z.string() })),
  /** Set for a 3D level whose `midnite.terrain` names a terrain pack that can be read (Phase 132 Theme E). */
  terrain: GameLevelTerrainSchema.nullable().optional(),
});
export type GameLevelGetResult = z.infer<typeof GameLevelGetResultSchema>;

export const GameLevelSetRequestSchema = z.object({
  gameId: z.string().min(1),
  scene: GameSceneNameSchema,
  level: z.unknown(),
  create: z.boolean().optional(),
});
export const GameLevelSetResultSchema = z.object({ sha: z.string().nullable() });
export type GameLevelSetResult = z.infer<typeof GameLevelSetResultSchema>;

export const GameGotoRequestSchema = z.object({ gameId: z.string().min(1), scene: GameSceneNameSchema });
export const GameGotoResultSchema = z.object({ via: z.enum(['hook', 'reload', 'next-run']) });
export type GameGotoResult = z.infer<typeof GameGotoResultSchema>;
