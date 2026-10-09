/**
 * Media ▸ Games over MCP (Phase 107 Theme D) — the `game_*` tools an agent uses
 * to see and play the game it is writing: create, open, run, screenshot, read
 * logs, send input and read the kit's state. Registered inline in `MCP_TOOLS`
 * (`mcp.ts`) like the `model_*` family; this file holds the ids, the zod
 * schemas those entries reuse and the exact refusal message.
 *
 * File edits are deliberately **not** tools: the agent edits the repo with its
 * own file tools, and these tools only see, play and configure.
 *
 * Connecting a session of your own: enable Settings ▸ MCP, turn on "Let agents
 * run and edit games", then `claude mcp add midnite -- node <shim path>`.
 */
import { z } from 'zod';

import {
  GameAgentEngineSchema,
  GameAssetNameSchema,
  GameAssetSourceSchema,
  GameImportAssetResultSchema,
  GameCreateRequestSchema,
  GameLogEntrySchema,
  GameManifestSchema,
  GameSummarySchema,
  GAME_LOG_LEVELS,
  GameStateSchema,
  GamePlaytestNameSchema,
  GamePlaytestSchema,
  GameReplaySchema,
  GameStateAssertOpSchema,
  GAME_REPLAY_MAX_FRAMES,
} from './media-game';

/** Ids of the tools, in the order an agent meets them. Themes N and O append their own. */
export const GAME_MCP_TOOL_IDS = [
  'game_list',
  'game_create',
  'game_open',
  'game_get_manifest',
  'game_set_manifest',
  'game_run',
  'game_stop',
  'game_reload',
  'game_screenshot',
  'game_logs',
  'game_input',
  'game_state',
  'game_import_asset',
  'game_replay_record',
  'game_replay_play',
  'game_assert_state',
  'game_assert_frame',
  'game_playtest',
] as const;
export type GameMcpToolId = (typeof GAME_MCP_TOOL_IDS)[number];
export const isGameMcpToolId = (value: string): value is GameMcpToolId =>
  (GAME_MCP_TOOL_IDS as readonly string[]).includes(value);

/** Tools that only read: they answer whenever the MCP server is on. Every other id is a write. */
export const GAME_MCP_READ_TOOL_IDS: readonly GameMcpToolId[] = [
  'game_list',
  'game_get_manifest',
  'game_logs',
  'game_screenshot',
  'game_state',
];

/** Tools that outlast the shim's default 60 s call timeout (a run boots a renderer, a burst waits between frames). */
export const GAME_SLOW_TOOL_IDS: readonly string[] = [
  'game_create',
  'game_run',
  'game_screenshot',
  'game_input',
  'game_replay_play',
  'game_playtest',
  'game_import_asset',
];
export const isGameSlowToolId = (value: string): boolean => GAME_SLOW_TOOL_IDS.includes(value);

/** What the shim allows a slow `game_*` call before giving up. */
export const GAME_CALL_TIMEOUT_MS = 120_000;

/** The exact refusal the write tools answer with while `McpSettings.allowGames` is off. */
export const GAMES_OFF_MESSAGE = 'Game running and editing is off — Settings ▸ MCP ▸ Let agents run and edit games';

/** Which game a call is about: a `gameId` from `game_list`, or the game repo's absolute path. */
export const GameToolTargetSchema = z.object({ game: z.string().min(1) });

export const GameCreateInputSchema = GameCreateRequestSchema.omit({ folder: true }).extend({
  /**
   * The engine that will write the game (Theme M), when the caller knows it. Naming an
   * Ollama engine creates the game all the same, and adds `GAMES_OLLAMA_WARNING` to `warnings`.
   */
  writer: GameAgentEngineSchema.optional(),
});

export const GameSetManifestInputSchema = GameToolTargetSchema.extend({
  /** Merged over the stored manifest and re-validated; `vendored` and `kitVersion` cannot change this way. */
  patch: z.record(z.string(), z.unknown()),
});

export const GAME_SCREENSHOT_COUNT_MAX = 16;
export const GameScreenshotInputSchema = GameToolTargetSchema.extend({
  count: z.number().int().min(1).max(GAME_SCREENSHOT_COUNT_MAX).default(1),
  intervalMs: z.number().int().min(50).max(2000).default(250),
  scale: z.number().min(0.25).max(1).default(0.5),
});

export const GAME_LOGS_LIMIT_MAX = 500;
export const GameLogsInputSchema = GameToolTargetSchema.extend({
  /** Cursor: the `next` of the previous call. */
  since: z.number().int().nonnegative().optional(),
  levels: z.array(z.enum(GAME_LOG_LEVELS)).optional(),
  limit: z.number().int().min(1).max(GAME_LOGS_LIMIT_MAX).default(200),
});

export const GAME_INPUT_MAX_EVENTS = 500;
export const GAME_INPUT_MAX_T_MS = 60_000;
const inputTime = z.number().min(0).max(GAME_INPUT_MAX_T_MS);
export const GameInputEventSchema = z.discriminatedUnion('type', [
  z.object({ t: inputTime, type: z.enum(['keyDown', 'keyUp']), key: z.string().min(1).max(32) }),
  z.object({
    t: inputTime,
    type: z.enum(['mouseMove', 'mouseDown', 'mouseUp']),
    x: z.number(),
    y: z.number(),
    button: z.enum(['left', 'right']).optional(),
  }),
  z.object({ t: inputTime, type: z.literal('gamepad'), button: z.number().int().min(0).max(16), pressed: z.boolean() }),
]);
export type GameInputEvent = z.infer<typeof GameInputEventSchema>;
export const GameImportAssetInputSchema = GameToolTargetSchema.extend({
  /** An item in a registered repo's media store, or a pack folder under a registered repo or the games location. */
  source: GameAssetSourceSchema,
  name: GameAssetNameSchema.optional(),
});

export const GameInputInputSchema = GameToolTargetSchema.extend({
  events: z.array(GameInputEventSchema).max(GAME_INPUT_MAX_EVENTS),
});

// --- outputs ---------------------------------------------------------------------

export const GameListOutputSchema = z.object({ games: z.array(GameSummarySchema) });
export const GameCreateOutputSchema = z.object({ path: z.string(), gameId: z.string(), warnings: z.array(z.string()) });
export const GameOpenOutputSchema = z.object({ opened: z.literal(true), gameId: z.string() });
export const GameGetManifestOutputSchema = z.object({
  gameId: z.string(),
  manifest: GameManifestSchema.nullable(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});
export const GameOkOutputSchema = z.object({ ok: z.literal(true), gameId: z.string() });
export const GameRunOutputSchema = z.object({ gameId: z.string(), runId: z.string() });
export const GameLogsOutputSchema = z.object({ entries: z.array(GameLogEntrySchema), next: z.number().int().nonnegative() });
export const GameInputOutputSchema = z.object({ sent: z.number().int().nonnegative() });
export const GameStateOutputSchema = z.object({ state: GameStateSchema });
export const GameImportAssetOutputSchema = GameImportAssetResultSchema.extend({ gameId: z.string() });

// --- play-test depth (Theme O) ----------------------------------------------------

/**
 * `start` restarts the game in deterministic mode (paused at its first step), starts the kit's
 * recorder and resumes, so a human plays from a known state; `stop` writes
 * `playtests/replays/<name>.replay.json`.
 */
export const GameReplayRecordInputSchema = GameToolTargetSchema.extend({
  action: z.enum(['start', 'stop']),
  /** Required on `stop`: the replay's file name, without `.replay.json`. */
  name: GamePlaytestNameSchema.optional(),
  /** `start` only; default 1. */
  seed: z.number().int().optional(),
});
export const GameReplayRecordOutputSchema = z.object({
  gameId: z.string(),
  recording: z.boolean(),
  seed: z.number().int().optional(),
  /** `stop`: where the replay was written, relative to the repo. */
  path: z.string().optional(),
  frames: z.number().int().nonnegative().optional(),
  events: z.number().int().nonnegative().optional(),
});

export const GameReplaySpeedSchema = z.union([z.literal(1), z.literal('max')]);
export const GameReplayPlayInputSchema = GameToolTargetSchema.extend({
  /** A path relative to the repo (`playtests/replays/walk.replay.json`), or a replay inline. */
  replay: z.union([z.string().min(1).max(256), GameReplaySchema]),
  /** `1` plays in real time (watchable); `max` steps as fast as the page can. */
  speed: GameReplaySpeedSchema.default('max'),
});
export const GameReplayPlayOutputSchema = z.object({
  gameId: z.string(),
  frames: z.number().int().nonnegative(),
  state: GameStateSchema,
});

/**
 * A state expectation at frame `frame` of the current run. The game is paused and stepped
 * forward to that frame (with the loaded replay's input, if any); a frame already passed is an
 * error — re-run with `game_replay_play` or `game_playtest` to go back.
 */
export const GameAssertStateInputSchema = GameToolTargetSchema.extend({
  frame: z.number().int().nonnegative().max(GAME_REPLAY_MAX_FRAMES),
  path: z.string().min(1).max(256),
  op: GameStateAssertOpSchema,
  value: z.unknown().optional(),
  epsilon: z.number().nonnegative().optional(),
});
export const GameAssertStateOutputSchema = z.object({
  gameId: z.string(),
  ok: z.boolean(),
  status: z.enum(['pass', 'fail', 'error']),
  message: z.string(),
  actual: z.unknown().optional(),
});

/** Compare frame `frame` with `playtests/baselines/<name>@<frame>.png`; a missing baseline is written. */
export const GameAssertFrameInputSchema = GameToolTargetSchema.extend({
  frame: z.number().int().nonnegative().max(GAME_REPLAY_MAX_FRAMES),
  name: GamePlaytestNameSchema,
  tolerance: z.number().min(0).max(1).default(0.01),
});

/** Run play-tests: a name in `playtests/`, an inline play-test, or every one when neither is given. */
export const GamePlaytestInputSchema = GameToolTargetSchema.extend({
  name: GamePlaytestNameSchema.optional(),
  playtest: GamePlaytestSchema.optional(),
});

/** `game_assert_frame` and `game_playtest` answer a JSON text block, then any diff or failure images. */
export const GameContentOutputSchema = z.object({ _content: z.array(z.unknown()) });
