/**
 * Media ▸ Games (Phase 107) — the wire contract for game repos, the games
 * location setting and the sandboxed runner.
 *
 * A game is a real codebase in its own git repo (Phaser for 2D, three.js +
 * Rapier for 3D); the app invents no game format. `midnite-game.json` at the
 * repo root is the only file the app owns, and `.passthrough()` lets an agent
 * add keys of its own.
 *
 * Themes A and B (repos, tab, settings, runner) own this file today. Later
 * themes (kits, MCP, assets, play-test, export) extend it rather than starting
 * a second file.
 */
import { z } from 'zod';

import { MediaTabSchema } from './media';

// --- constants ---------------------------------------------------------------

/** The privileged scheme a running game is served from: `mstudio-game://<gameId>/`. */
export const MSTUDIO_GAME_SCHEME = 'mstudio-game' as const;

/** The manifest file at a game repo's root. */
export const GAME_MANIFEST_FILE = 'midnite-game.json' as const;

/** Each run is a renderer process; a fourth concurrent run is refused. */
export const GAMES_MAX_RUNNING = 3;
/** Console / error entries kept per run. `seq` is monotonic, so `since` is a cursor. */
export const GAME_LOG_CAPACITY = 2000;
/** A console entry's text is truncated to this many characters (with an ellipsis). */
export const GAME_LOG_TEXT_MAX = 4096;
/** The renderer receives console entries batched at this interval. */
export const GAME_CONSOLE_BATCH_MS = 250;

/** `game_state` caps the page's answer here; larger is an error, never truncated. */
export const GAME_STATE_MAX_BYTES = 256 * 1024;
/** `game_state` refuses a value nested deeper than this. */
export const GAME_STATE_MAX_DEPTH = 32;

/** Shown in Settings ▸ Media ▸ Games, and over MCP and in the iterate panel once agents land. */
export const GAMES_OLLAMA_WARNING =
  'Local Ollama models are much weaker at writing whole games than a roster agent CLI. Expect small, focused edits to work and large rewrites to break — and review every change before you play it.';

/** The exact-pinned engine versions vendored into game repositories (Phase 107 Theme C). */
export const GAME_ENGINE_VERSIONS = {
  phaser: '3.90.0',
  three: '0.186.1',
  rapier: '0.21.0',
  recast: '0.43.1',
} as const;

/** The current kit version (Theme C). Bumped whenever `templates/media-game/kit/` changes. */
export const GAME_KIT_VERSION = '0.6.0';

// --- enums -------------------------------------------------------------------

export const GAME_ENGINES = ['phaser', 'three'] as const;
export const GameEngineSchema = z.enum(GAME_ENGINES);
export type GameEngine = z.infer<typeof GameEngineSchema>;

export const GAME_DIMENSIONS = ['2d', '3d'] as const;
export const GameDimensionSchema = z.enum(GAME_DIMENSIONS);
export type GameDimension = z.infer<typeof GameDimensionSchema>;

export const GAME_PERSPECTIVES = [
  // 2D
  'platformer',
  'top-down',
  'isometric',
  'raycaster',
  // 3D
  'first-person',
  'third-person',
] as const;
export const GamePerspectiveSchema = z.enum(GAME_PERSPECTIVES);
export type GamePerspective = z.infer<typeof GamePerspectiveSchema>;

export const GAME_GENRES = [
  // 2D
  'fps',
  'rts',
  'arpg',
  'crime',
  // 3D
  'shooter',
  'fighter',
  'soulslike',
  'rpg',
  'character-action',
  'open-world',
] as const;
export const GameGenreSchema = z.enum(GAME_GENRES);
export type GameGenre = z.infer<typeof GameGenreSchema>;

/** The five third-person cameras (3D only). */
export const GAME_CAMERA_IDS = [
  'over-shoulder-left',
  'over-shoulder-right',
  'behind',
  'further-behind',
  'much-further-behind',
] as const;
export const GameCameraIdSchema = z.enum(GAME_CAMERA_IDS);
export type GameCameraId = z.infer<typeof GameCameraIdSchema>;

/**
 * Each third-person camera's offset `[x, y, z]` in metres from the player's head-height pivot
 * (+x right, +y up, +z behind). The kit's `kit/core/cameras.js` carries the same table.
 */
export const GAME_CAMERA_OFFSETS: Readonly<Record<GameCameraId, readonly [number, number, number]>> = {
  'over-shoulder-left': [-0.7, 0.2, 2.4],
  'over-shoulder-right': [0.7, 0.2, 2.4],
  behind: [0, 0.4, 4.0],
  'further-behind': [0, 1.2, 7.0],
  'much-further-behind': [0, 3.0, 12.0],
};

export const GameNetworkSchema = z.enum(['off', 'on']);
export type GameNetwork = z.infer<typeof GameNetworkSchema>;

// --- manifest ----------------------------------------------------------------

export const GAME_ASSET_KINDS = [
  'terrain',
  'sprite',
  'tileset',
  'map',
  'background',
  'model',
  'image',
  'audio',
] as const;

export const GameAssetProvenanceSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(GAME_ASSET_KINDS),
  path: z.string().min(1),
  source: z.object({
    tab: MediaTabSchema,
    repoId: z.string().nullable(),
    path: z.string(),
  }),
  sha256: z.string(),
  importedAt: z.string(),
});
export type GameAssetProvenance = z.infer<typeof GameAssetProvenanceSchema>;

/**
 * `midnite-game.json`. `.passthrough()` so an agent may add keys of its own;
 * everything the app reads is below.
 */
export const GameManifestSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(80),
    engine: GameEngineSchema,
    dimension: GameDimensionSchema,
    perspective: GamePerspectiveSchema,
    genre: GameGenreSchema.nullable(),
    /** The starter this game was composed from (Theme K's id; `blank` until starters land). */
    starter: z.string().min(1),
    /** 3D third-person only. */
    cameraPresets: z.array(GameCameraIdSchema).default([]),
    entry: z.literal('index.html').default('index.html'),
    kitVersion: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, 'must be a semver version'),
    vendored: z
      .object({
        phaser: z.string().optional(),
        three: z.string().optional(),
        rapier: z.string().optional(),
        recast: z.string().optional(),
      })
      .default({}),
    assets: z.array(GameAssetProvenanceSchema).default([]),
    network: GameNetworkSchema.default('off'),
    deterministic: z.boolean().default(false),
    /** Keep localStorage / IndexedDB across runs (`persist:game-<id>` instead of an in-memory partition). */
    keepSaveData: z.boolean().default(false),
  })
  .passthrough();
export type GameManifest = z.infer<typeof GameManifestSchema>;

export type GameManifestIssue = { path: string; message: string };
export type GameManifestParse =
  | { ok: true; manifest: GameManifest }
  | { ok: false; issues: GameManifestIssue[] };

/** Never throws — an agent may have hand-edited the file. */
export function parseGameManifest(value: unknown): GameManifestParse {
  const parsed = GameManifestSchema.safeParse(value);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  };
}

/** A folder name for a game: lowercase, `a-z0-9` runs joined by `-`, never empty. */
export function gameSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug === '' ? 'game' : slug;
}

// --- settings ----------------------------------------------------------------

export const GamesSettingsSchema = z.object({
  version: z.literal(1),
  /** `null` means the default, `~/Midnite Games`. */
  gamesRoot: z.string().nullable(),
  defaultEngine: GameEngineSchema,
  defaultNetwork: GameNetworkSchema,
  squashRunCommits: z.boolean(),
});
export type GamesSettings = z.infer<typeof GamesSettingsSchema>;

export const DEFAULT_GAMES_SETTINGS: GamesSettings = {
  version: 1,
  gamesRoot: null,
  defaultEngine: 'phaser',
  defaultNetwork: 'off',
  squashRunCommits: false,
};

/** What the Settings page reads: the stored settings and where the default resolves. */
export const GamesSettingsReadSchema = z.object({
  settings: GamesSettingsSchema,
  /** The folder games are created in (the stored root, or the default). */
  resolvedRoot: z.string(),
  /** A validation message when the stored root is no longer usable, else `null`. */
  rootProblem: z.string().nullable(),
});
export type GamesSettingsRead = z.infer<typeof GamesSettingsReadSchema>;

export const GamesSettingsPatchSchema = GamesSettingsSchema.omit({ version: true }).partial();
export type GamesSettingsPatch = z.infer<typeof GamesSettingsPatchSchema>;

// --- list / create -----------------------------------------------------------

export const GameSummarySchema = z.object({
  gameId: z.string(),
  name: z.string(),
  path: z.string(),
  engine: GameEngineSchema.nullable(),
  dimension: GameDimensionSchema.nullable(),
  starter: z.string().nullable(),
  dirty: z.boolean(),
  valid: z.boolean(),
  /** The first manifest issue, shown as the tooltip on an invalid row. */
  issue: z.string().nullable(),
});
export type GameSummary = z.infer<typeof GameSummarySchema>;

export const GamesListSchema = z.object({ games: z.array(GameSummarySchema) });
export type GamesList = z.infer<typeof GamesListSchema>;

export const GameCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  engine: GameEngineSchema,
  perspective: GamePerspectiveSchema,
  genre: GameGenreSchema.nullable().default(null),
  /** The starter id (Theme K). Defaults to the blank scaffold until starters land. */
  starter: z.string().min(1).default('blank'),
  /** Parent folder; defaults to the games location setting. */
  folder: z.string().min(1).optional(),
  network: GameNetworkSchema.optional(),
  /** Third-person cameras the cycle is limited to; empty or omitted = all five. */
  cameras: z.array(GameCameraIdSchema).max(5).optional(),
});
export type GameCreateRequest = z.input<typeof GameCreateRequestSchema>;

export const GameCreateResultSchema = z.object({ path: z.string(), gameId: z.string() });
export type GameCreateResult = z.infer<typeof GameCreateResultSchema>;

export const GameIdRequest = z.object({ gameId: z.string().min(1) });
export const GameManifestGetResponse = z.object({
  manifest: GameManifestSchema.nullable(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});
export const GameManifestSetRequest = z.object({
  gameId: z.string().min(1),
  /** A partial patch merged over the stored manifest, then re-validated. */
  patch: z.record(z.string(), z.unknown()),
});

// --- runner ------------------------------------------------------------------

export const GAME_RUN_STATES = ['starting', 'running', 'paused', 'stopped', 'crashed'] as const;
export const GameRunStateSchema = z.enum(GAME_RUN_STATES);
export type GameRunState = z.infer<typeof GameRunStateSchema>;

export const GameRunStatePayload = z.object({
  gameId: z.string(),
  runId: z.string(),
  state: GameRunStateSchema,
  /** Why it stopped or crashed. */
  reason: z.string().optional(),
});
export type GameRunStatePayload = z.infer<typeof GameRunStatePayload>;

export const GAME_LOG_LEVELS = ['log', 'info', 'warn', 'error', 'exception', 'crash'] as const;
export type GameLogLevel = (typeof GAME_LOG_LEVELS)[number];
export const GameLogEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  at: z.number(),
  level: z.enum(GAME_LOG_LEVELS),
  text: z.string(),
  source: z.string().optional(),
  line: z.number().int().optional(),
});
export type GameLogEntry = z.infer<typeof GameLogEntrySchema>;

export const GameConsolePayload = z.object({
  gameId: z.string(),
  runId: z.string(),
  entries: z.array(GameLogEntrySchema),
});
export type GameConsolePayload = z.infer<typeof GameConsolePayload>;

export const GameRunResult = z.object({ runId: z.string() });

export const GameBoundsRequest = z.object({
  gameId: z.string().min(1),
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
});
export const GameVisibleRequest = z.object({ gameId: z.string().min(1), visible: z.boolean() });

export const GAME_TOOLBAR_ACTIONS = ['pause', 'resume', 'mute', 'unmute', 'devtools', 'overlay'] as const;
export const GameToolbarRequest = z.object({
  gameId: z.string().min(1),
  action: z.enum(GAME_TOOLBAR_ACTIONS),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const GameLogsRequest = z.object({
  gameId: z.string().min(1),
  /** Cursor: only entries with `seq` greater than this. */
  since: z.number().int().nonnegative().optional(),
});
export const GameLogsResponse = z.object({
  runId: z.string().nullable(),
  entries: z.array(GameLogEntrySchema),
});

/** Pushed when the set of games on disk changes (create, remove, manifest edit). */
export const GamesChangedSchema = z.object({ reason: z.enum(['created', 'manifest', 'removed']) });
export type GamesChangedEvent = z.infer<typeof GamesChangedSchema>;

// --- play-test state (Theme D) ---------------------------------------------------

/** The player block every kit preset reports: a 2D or 3D position, and health when the genre has it. */
export const GamePlayerStateSchema = z
  .object({
    position: z.array(z.number()).min(2).max(3),
    health: z.number().optional(),
  })
  .passthrough();

/**
 * What a game's `window.__midnite.getState()` returns, as `game_state` accepts
 * it. Untrusted data from the page. Theme E tightens the common keys: each one
 * is optional (a hand-written game with no kit reports whatever it likes), but
 * when present it must have the kit's type, so an agent can rely on
 * `state.player.position` being numbers whenever it exists. Everything else
 * passes through — each genre reports its own keys.
 */
export const GameStateSchema = z
  .object({
    version: z.literal(1).optional(),
    scene: z.string().optional(),
    frame: z.number().int().nonnegative().optional(),
    time: z.number().nonnegative().optional(),
    player: GamePlayerStateSchema.optional(),
    score: z.number().optional(),
  })
  .passthrough();
export type GameState = z.infer<typeof GameStateSchema>;

/**
 * The kit's own contract (`kit/core/hook.js`, Theme E): what every kit-built
 * game's `getState()` reports at minimum. `kit-core.test.ts` holds the kit to it.
 */
export const KitGameStateSchema = GameStateSchema.extend({
  version: z.literal(1),
  scene: z.string(),
  frame: z.number().int().nonnegative(),
  time: z.number().nonnegative(),
});
export type KitGameState = z.infer<typeof KitGameStateSchema>;

/** `window.__midnite.version` — bumped when the hook's shape changes. */
export const GAME_HOOK_VERSION = 1;

/** Nesting depth of a JSON value (a scalar is 0). Iterative, so a hostile value cannot overflow the stack. */
export function jsonDepth(value: unknown): number {
  let max = 0;
  const stack: Array<[unknown, number]> = [[value, 0]];
  while (stack.length > 0) {
    const [current, depth] = stack.pop() as [unknown, number];
    if (depth > max) max = depth;
    if (typeof current === 'object' && current !== null) {
      for (const child of Array.isArray(current) ? current : Object.values(current)) stack.push([child, depth + 1]);
    }
  }
  return max;
}

/** Pushed on `mstudio:games:open` when an agent's `game_open` asks the window to show a game. */
export const GamesOpenEventSchema = z.object({ gameId: z.string().min(1) });
export type GamesOpenEvent = z.infer<typeof GamesOpenEventSchema>;

// --- pop out (Theme B) ------------------------------------------------------------

/**
 * Which game the `game` popout window hosts, or `null` when none is popped out.
 * There is one `game` window role, so at most one game is popped out at a time —
 * popping a second docks the first. Answered by `gamesPopped` and pushed on
 * `gamesPopState` whenever it changes, to every window.
 */
export const GamePopStateSchema = z.object({ gameId: z.string().min(1).nullable() });
export type GamePopState = z.infer<typeof GamePopStateSchema>;

/**
 * `gamesPopped`'s answer: the popped game plus its current run, so the popout's
 * own renderer — a fresh process that missed every earlier `gamesRunState` push —
 * knows at once whether to show the stage or a Run button.
 */
export const GamePoppedResponseSchema = GamePopStateSchema.extend({ run: GameRunStatePayload.nullable() });
export type GamePoppedResponse = z.infer<typeof GamePoppedResponseSchema>;
