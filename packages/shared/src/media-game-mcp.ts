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
  GameCreateRequestSchema,
  GameLogEntrySchema,
  GameManifestSchema,
  GameSummarySchema,
  GAME_LOG_LEVELS,
  GameStateSchema,
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
export const GAME_SLOW_TOOL_IDS: readonly string[] = ['game_create', 'game_run', 'game_screenshot', 'game_input'];
export const isGameSlowToolId = (value: string): boolean => GAME_SLOW_TOOL_IDS.includes(value);

/** What the shim allows a slow `game_*` call before giving up. */
export const GAME_CALL_TIMEOUT_MS = 120_000;

/** The exact refusal the write tools answer with while `McpSettings.allowGames` is off. */
export const GAMES_OFF_MESSAGE = 'Game running and editing is off — Settings ▸ MCP ▸ Let agents run and edit games';

/** Which game a call is about: a `gameId` from `game_list`, or the game repo's absolute path. */
export const GameToolTargetSchema = z.object({ game: z.string().min(1) });

export const GameCreateInputSchema = GameCreateRequestSchema.omit({ folder: true });

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
export const GameInputInputSchema = GameToolTargetSchema.extend({
  events: z.array(GameInputEventSchema).max(GAME_INPUT_MAX_EVENTS),
});

// --- outputs ---------------------------------------------------------------------

export const GameListOutputSchema = z.object({ games: z.array(GameSummarySchema) });
export const GameCreateOutputSchema = z.object({ path: z.string(), gameId: z.string() });
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
