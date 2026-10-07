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

import { LoopModelSchema } from './loops';
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
  'Local models struggle to write whole games. Expect better results from small, focused edits; an agent engine is recommended for creating games.';

/** The exact-pinned engine versions vendored into game repositories (Phase 107 Theme C). */
export const GAME_ENGINE_VERSIONS = {
  phaser: '3.90.0',
  three: '0.186.1',
  rapier: '0.21.0',
  recast: '0.43.1',
} as const;

/** The current kit version (Theme C). Bumped whenever `templates/media-game/kit/` changes. */
export const GAME_KIT_VERSION = '0.7.0';

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
    /** Relative to `<repoPath>/.midnite/media/<tab>/`, or absolute for a pack folder (no `repoPath`). */
    path: z.string(),
    /** The repo the asset was picked from (Theme N); absent for a pack folder. */
    repoPath: z.string().optional(),
  }),
  /** Of the copy in the game: of the file, or of the sorted `path\0sha256\n` list for a folder. */
  sha256: z.string(),
  /** Of the source as it was imported, which is what a re-sync compares (a terrain's copy is an export, so differs). */
  sourceSha256: z.string().optional(),
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

// --- create and iterate (Theme M) ---------------------------------------------

/** Refinement passes a game agent run may ask for: each pass is a full CLI run in the repo, so 20, not Models' 100. */
export const GAME_PASSES_MAX = 20;
export const GAME_PASSES_DEFAULT = 3;
/** The longest prompt a run accepts. */
export const GAME_PROMPT_MAX = 8000;

/**
 * Who writes the game: a roster agent CLI that speaks MCP (Claude Code, Codex),
 * or a local Ollama model, which only ever returns whole `src/` files.
 */
export const GameAgentEngineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agent'), agentId: z.string().min(1).max(64), model: LoopModelSchema.optional() }),
  z.object({ kind: z.literal('ollama'), model: z.string().min(1).max(200) }),
]);
export type GameAgentEngine = z.infer<typeof GameAgentEngineSchema>;

/** The warnings a run (or `game_create`) carries for an engine: Ollama's, else none. */
export const gameEngineWarnings = (engine: GameAgentEngine | undefined | null): string[] =>
  engine?.kind === 'ollama' ? [GAMES_OLLAMA_WARNING] : [];

export const GameAgentRunRequestSchema = z.object({
  gameId: z.string().min(1),
  prompt: z.string().trim().min(1).max(GAME_PROMPT_MAX),
  engine: GameAgentEngineSchema,
  passes: z.number().int().min(1).max(GAME_PASSES_MAX).default(GAME_PASSES_DEFAULT),
});
export type GameAgentRunRequest = z.input<typeof GameAgentRunRequestSchema>;
export const GameAgentRunResultSchema = z.object({ runId: z.string(), warnings: z.array(z.string()) });
export type GameAgentRunResult = z.infer<typeof GameAgentRunResultSchema>;

/** Undo turn: revert one agent commit. Only the game's newest commit, and only an agent's, is accepted. */
export const GameAgentUndoRequestSchema = z.object({ gameId: z.string().min(1), sha: z.string().regex(/^[0-9a-f]{7,64}$/i) });
export type GameAgentUndoRequest = z.infer<typeof GameAgentUndoRequestSchema>;

/** Every agent commit's subject starts with this, which is how Undo turn recognises one. */
export const GAME_AGENT_COMMIT_PREFIX = 'agent: ';

export const GameAgentCommitSchema = z.object({ sha: z.string(), files: z.array(z.string()) });
export type GameAgentCommit = z.infer<typeof GameAgentCommitSchema>;

export const GAME_AGENT_OUTCOMES = ['done', 'cancelled', 'failed'] as const;

/**
 * `mstudio:games:agent-progress` — one event per step of a run: a pass starting,
 * a tool the agent called (`action`), a pass's commit, and the run's end.
 */
export const GameAgentProgressSchema = z.object({
  gameId: z.string(),
  runId: z.string(),
  pass: z.number().int().nonnegative(),
  of: z.number().int().positive(),
  action: z.string().optional(),
  commit: GameAgentCommitSchema.optional(),
  finished: z
    .object({
      outcome: z.enum(GAME_AGENT_OUTCOMES),
      message: z.string(),
      /** The commits the run left (after a squash, the one squashed commit). */
      commits: z.array(GameAgentCommitSchema),
    })
    .optional(),
});
export type GameAgentProgress = z.infer<typeof GameAgentProgressSchema>;

/** Ollama's reply: whole-file replacements, under `src/` only. */
export const GAME_OLLAMA_MAX_FILES = 10;
export const GAME_OLLAMA_FILE_MAX_BYTES = 200 * 1024;
/** How much of the repo an Ollama pass is shown. */
export const GAME_OLLAMA_CONTEXT_MAX_BYTES = 60 * 1024;
export const GameOllamaEnvelopeSchema = z.object({
  files: z
    .array(z.object({ path: z.string().min(1).max(300), content: z.string().max(GAME_OLLAMA_FILE_MAX_BYTES) }))
    .max(GAME_OLLAMA_MAX_FILES),
  summary: z.string().max(2000).default(''),
});
export type GameOllamaEnvelope = z.infer<typeof GameOllamaEnvelopeSchema>;

/**
 * Normalises a path an Ollama envelope names, or explains why it is refused:
 * only `.js`/`.json` files under `src/`, never `..`, `kit/`, `vendor/` or an absolute path.
 */
export function checkGameOllamaPath(raw: string): { ok: true; path: string } | { ok: false; message: string } {
  const refused = { ok: false as const, message: `The model tried to edit ${raw}; only files under src/ can be changed.` };
  if (raw.includes('\0') || raw.split(/[\\/]/).includes('..')) return refused;
  const path = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/');
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) return refused;
  if (!/^src\/[^\0]+\.(js|json)$/.test(path)) return refused;
  return { ok: true, path };
}

// --- asset bridge (Theme N) ----------------------------------------------------------

/** `assets/index.json` — the one lookup the kits use (`kit/core/asset-index.js`). */
export const GameAssetIndexEntrySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(GAME_ASSET_KINDS),
  /** Relative to the repo root, `/`-separated. A folder, or the file itself for a single-file asset. */
  path: z.string().min(1),
  /** The file inside a folder asset that opens it: `terrain.manifest.json`, `atlas.json`, `map.tmj`, ... */
  entry: z.string().optional(),
});
export type GameAssetIndexEntry = z.infer<typeof GameAssetIndexEntrySchema>;

export const GameAssetIndexSchema = z.object({
  version: z.literal(1),
  assets: z.array(GameAssetIndexEntrySchema).default([]),
});
export type GameAssetIndex = z.infer<typeof GameAssetIndexSchema>;
export const GAME_ASSET_INDEX_FILE = 'assets/index.json';

/** The tabs a game can import from. */
export const GAME_ASSET_SOURCE_TABS = ['terrain', 'sprite', 'model', 'image', 'audio'] as const;
export const GameAssetSourceTabSchema = z.enum(GAME_ASSET_SOURCE_TABS);
export type GameAssetSourceTab = z.infer<typeof GameAssetSourceTabSchema>;

const GAME_ASSET_PATH = z
  .string()
  .min(1)
  .max(512)
  .refine((p) => !p.includes('\0'), 'must not contain NUL')
  .refine((p) => !p.startsWith('/'), 'must be relative')
  .refine((p) => !p.split('/').some((seg) => seg === '..' || seg === ''), 'must not traverse');

/** Where an import comes from: an item in a repo's media store, or a pack folder picked from disk. */
export const GameAssetSourceSchema = z.union([
  z.object({ tab: GameAssetSourceTabSchema, repoPath: z.string().min(1), path: GAME_ASSET_PATH }),
  z.object({ packPath: z.string().min(1) }),
]);
export type GameAssetSource = z.infer<typeof GameAssetSourceSchema>;

export const GameAssetNameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'use letters, digits, dot, dash and underscore');

export const GameImportAssetRequestSchema = z.object({
  gameId: z.string().min(1),
  source: GameAssetSourceSchema,
  name: GameAssetNameSchema.optional(),
});
export type GameImportAssetRequest = z.infer<typeof GameImportAssetRequestSchema>;

export const GameImportAssetResultSchema = z.object({
  name: z.string(),
  kind: z.enum(GAME_ASSET_KINDS),
  path: z.string(),
  entry: z.string().optional(),
  sha256: z.string(),
  /** The `assets: import <name>` commit, or `null` when the commit was left out (nothing changed). */
  commit: z.string().nullable(),
});
export type GameImportAssetResult = z.infer<typeof GameImportAssetResultSchema>;

/** Candidates for the picker: one list per registered repo that has media in that tab. */
export const GameAssetSourcesRequestSchema = z.object({ tab: GameAssetSourceTabSchema });
export const GameAssetSourceItemSchema = z.object({
  /** Relative to `<repoPath>/.midnite/media/<tab>/`. */
  path: z.string(),
  label: z.string(),
  kind: z.enum(GAME_ASSET_KINDS),
  bytes: z.number().int().nonnegative(),
});
export type GameAssetSourceItem = z.infer<typeof GameAssetSourceItemSchema>;
export const GameAssetSourcesResultSchema = z.object({
  repos: z.array(z.object({ repoPath: z.string(), name: z.string(), items: z.array(GameAssetSourceItemSchema) })),
});
export type GameAssetSourcesResult = z.infer<typeof GameAssetSourcesResultSchema>;

/**
 * Re-sync. `check: true` only reports; without it, `names` (default: every changed one) are
 * re-imported over their copies in one `assets: re-import <names>` commit.
 */
export const GameResyncRequestSchema = z.object({
  gameId: z.string().min(1),
  check: z.boolean().default(false),
  names: z.array(z.string().min(1)).optional(),
});
export type GameResyncRequest = z.input<typeof GameResyncRequestSchema>;
export const GAME_ASSET_SYNC_STATES = ['current', 'changed', 'missing'] as const;
export const GameResyncResultSchema = z.object({
  assets: z.array(
    z.object({ name: z.string(), kind: z.enum(GAME_ASSET_KINDS), state: z.enum(GAME_ASSET_SYNC_STATES), importedAt: z.string() }),
  ),
  changed: z.number().int().nonnegative(),
  reimported: z.array(z.string()),
  commit: z.string().nullable(),
});
export type GameResyncResult = z.infer<typeof GameResyncResultSchema>;

// --- play-test depth (Theme O) -----------------------------------------------------

/**
 * Where a game keeps its play-tests: `playtests/<name>.json` (a replay plus
 * assertions), recorded input at `playtests/replays/<name>.replay.json`, frame
 * baselines at `playtests/baselines/<name>@<frame>.png`, and the last results
 * at `playtests/results/<name>.json` (git-ignored by the template).
 */
export const GAME_PLAYTESTS_DIR = 'playtests' as const;
export const GAME_REPLAYS_DIR = 'playtests/replays' as const;
export const GAME_BASELINES_DIR = 'playtests/baselines' as const;
export const GAME_RESULTS_DIR = 'playtests/results' as const;

/**
 * The query the runner adds to `index.html` for a deterministic run, read by
 * `kit/core/determinism.js` before any game module runs. `paused` starts the
 * kit loop paused after its first step, so a play-test begins at a known frame.
 */
export const GAME_DETERMINISM_PARAMS = {
  deterministic: 'midnite-deterministic',
  seed: 'midnite-seed',
  paused: 'midnite-paused',
} as const;

/** A replay longer than this (ten minutes at 60 Hz) is refused. */
export const GAME_REPLAY_MAX_FRAMES = 36_000;
export const GAME_REPLAY_MAX_EVENTS = 20_000;
/** A replay or play-test file, or a recording the page answers with, larger than this is refused. */
export const GAME_REPLAY_MAX_BYTES = 2 * 1024 * 1024;
export const GAME_PLAYTEST_MAX_ASSERTS = 100;

/** A play-test, replay or baseline name: a file name without its extension. */
export const GamePlaytestNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'use letters, digits, `-` and `_` (at most 64)');

/** One input change: action `action` goes down (or up) before step `f`. Kit action names, never keys. */
export const GameReplayEventSchema = z.object({
  f: z.number().int().nonnegative().max(GAME_REPLAY_MAX_FRAMES),
  action: z.string().min(1).max(64),
  down: z.boolean(),
});
export type GameReplayEvent = z.infer<typeof GameReplayEventSchema>;

/**
 * `.replay.json`: frame-indexed actions, not wall-clock times, so playback is
 * frame-exact at 1× or as fast as possible. `f` counts kit steps since the game
 * booted (the same count `getState().frame` reports); `frames` is where it ends.
 */
export const GameReplaySchema = z
  .object({
    version: z.literal(1),
    seed: z.number().int(),
    frames: z.number().int().nonnegative().max(GAME_REPLAY_MAX_FRAMES),
    events: z.array(GameReplayEventSchema).max(GAME_REPLAY_MAX_EVENTS),
  })
  .refine((replay) => replay.events.every((event) => event.f <= replay.frames), {
    message: 'every event must be at or before `frames`',
    path: ['events'],
  });
export type GameReplay = z.infer<typeof GameReplaySchema>;

export const GAME_STATE_ASSERT_OPS = ['eq', 'ne', 'lt', 'gt', 'exists', 'approx'] as const;
export const GameStateAssertOpSchema = z.enum(GAME_STATE_ASSERT_OPS);

const assertFrame = z.number().int().nonnegative().max(GAME_REPLAY_MAX_FRAMES);
export const GameStateAssertSchema = z.object({
  frame: assertFrame,
  kind: z.literal('state'),
  /** A restricted JSON path: `$`, `.key`, `["key"]`, `[n]` (`shared/src/game/json-path.ts`). */
  path: z.string().min(1).max(256),
  op: GameStateAssertOpSchema,
  value: z.unknown().optional(),
  /** `approx` only; default 1e-6. */
  epsilon: z.number().nonnegative().optional(),
});
export const GameFrameAssertSchema = z.object({
  frame: assertFrame,
  kind: z.literal('frame'),
  /** Baseline name; the file is `playtests/baselines/<baseline>@<frame>.png`. Defaults to the play-test's name. */
  baseline: GamePlaytestNameSchema.optional(),
  /** Largest changed fraction that still passes (default 0.01). */
  tolerance: z.number().min(0).max(1).optional(),
});
export const GamePlaytestAssertSchema = z.discriminatedUnion('kind', [GameStateAssertSchema, GameFrameAssertSchema]);
export type GamePlaytestAssert = z.infer<typeof GamePlaytestAssertSchema>;

/**
 * `playtests/<name>.json`: a replay (a path relative to the repo, or inline)
 * plus assertions at frames. Running one forces deterministic mode.
 */
export const GamePlaytestSchema = z.object({
  version: z.literal(1),
  name: GamePlaytestNameSchema,
  description: z.string().max(500).optional(),
  replay: z.union([z.string().min(1).max(256), GameReplaySchema]),
  asserts: z.array(GamePlaytestAssertSchema).min(1).max(GAME_PLAYTEST_MAX_ASSERTS),
});
export type GamePlaytest = z.infer<typeof GamePlaytestSchema>;

/** `baseline-created` is neither a pass nor a fail: the first run of a frame assertion writes its baseline. */
export const GAME_ASSERT_STATUSES = ['pass', 'fail', 'baseline-created', 'error'] as const;
export const GameAssertStatusSchema = z.enum(GAME_ASSERT_STATUSES);
export type GameAssertStatus = z.infer<typeof GameAssertStatusSchema>;

export const GameAssertResultSchema = z.object({
  assertIndex: z.number().int().nonnegative(),
  frame: z.number().int().nonnegative(),
  kind: z.enum(['state', 'frame']),
  /** `false` only for `fail` and `error`. */
  ok: z.boolean(),
  status: GameAssertStatusSchema,
  message: z.string(),
  /** A failure's screenshot, relative to the repo (`playtests/results/…png`). */
  screenshot: z.string().optional(),
  /** A failed frame assertion's diff image, relative to the repo. */
  diff: z.string().optional(),
  changedFraction: z.number().optional(),
});
export type GameAssertResult = z.infer<typeof GameAssertResultSchema>;

export const GamePlaytestResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  ranAt: z.string(),
  frames: z.number().int().nonnegative(),
  ms: z.number().nonnegative(),
  results: z.array(GameAssertResultSchema),
  /** Set when the play-test could not run at all (bad file, no hook, game crashed). */
  error: z.string().optional(),
});
export type GamePlaytestResult = z.infer<typeof GamePlaytestResultSchema>;

export const GamePlaytestEntrySchema = z.object({
  name: z.string(),
  file: z.string(),
  valid: z.boolean(),
  issue: z.string().nullable(),
  /** The last saved result, when there is one. */
  last: GamePlaytestResultSchema.nullable(),
});
export type GamePlaytestEntry = z.infer<typeof GamePlaytestEntrySchema>;
export const GamePlaytestListSchema = z.object({ playtests: z.array(GamePlaytestEntrySchema) });
export type GamePlaytestList = z.infer<typeof GamePlaytestListSchema>;

export const GamePlaytestRunRequestSchema = z.object({
  gameId: z.string().min(1),
  /** Empty or omitted: every valid play-test (Run all). */
  names: z.array(GamePlaytestNameSchema).max(100).optional(),
});
export type GamePlaytestRunRequest = z.infer<typeof GamePlaytestRunRequestSchema>;
export const GamePlaytestRunResultSchema = z.object({
  passed: z.boolean(),
  runs: z.array(GamePlaytestResultSchema),
});
export type GamePlaytestRunResult = z.infer<typeof GamePlaytestRunResultSchema>;
