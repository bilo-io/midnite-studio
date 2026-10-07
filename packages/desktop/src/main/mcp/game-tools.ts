import { GAMES_OFF_MESSAGE, type McpToolInput, type McpToolOutput } from '@midnite/studio-shared';

import type { GameMcpTools } from '../games/game-mcp';
import { McpToolError } from './errors';
import { getMcpAllowGames } from './ui-gate';

/**
 * The `game_*` tools as the app's global MCP server answers them (Phase 107
 * Theme D): the implementations in `games/game-mcp.ts`, wrapped in the consent
 * model every other state-changing tool has. The tools that create a game, run
 * its code, edit its manifest or drive it refuse with a named reason while
 * `Settings ▸ MCP ▸ Let agents run and edit games` is off; the read tools
 * (list, manifest, logs, screenshot, state) answer whenever the server is on.
 *
 * Bound at startup (`setGameTools`, from `main/index.ts`, where the game
 * service lives); until then a call is answered, not thrown, with a plain error.
 */

let bound: GameMcpTools | null = null;

export function setGameTools(tools: GameMcpTools | null): void {
  bound = tools;
}

function tools(): GameMcpTools {
  if (!bound) throw new McpToolError('error', 'Media ▸ Games is not ready yet.');
  return bound;
}

function allowed(): void {
  if (!getMcpAllowGames()) throw new McpToolError('refused', GAMES_OFF_MESSAGE);
}

export const gameList = async (input: McpToolInput<'game_list'>): Promise<McpToolOutput<'game_list'>> => tools().game_list(input);
export const gameGetManifest = async (input: McpToolInput<'game_get_manifest'>): Promise<McpToolOutput<'game_get_manifest'>> =>
  tools().game_get_manifest(input);
export const gameScreenshot = async (input: McpToolInput<'game_screenshot'>): Promise<McpToolOutput<'game_screenshot'>> =>
  tools().game_screenshot(input);
export const gameLogs = async (input: McpToolInput<'game_logs'>): Promise<McpToolOutput<'game_logs'>> => tools().game_logs(input);
export const gameState = async (input: McpToolInput<'game_state'>): Promise<McpToolOutput<'game_state'>> => tools().game_state(input);

export const gameCreate = async (input: McpToolInput<'game_create'>): Promise<McpToolOutput<'game_create'>> => {
  allowed();
  return tools().game_create(input);
};
export const gameOpen = async (input: McpToolInput<'game_open'>): Promise<McpToolOutput<'game_open'>> => {
  allowed();
  return tools().game_open(input);
};
export const gameSetManifest = async (input: McpToolInput<'game_set_manifest'>): Promise<McpToolOutput<'game_set_manifest'>> => {
  allowed();
  return tools().game_set_manifest(input);
};
export const gameRun = async (input: McpToolInput<'game_run'>): Promise<McpToolOutput<'game_run'>> => {
  allowed();
  return tools().game_run(input);
};
export const gameStop = async (input: McpToolInput<'game_stop'>): Promise<McpToolOutput<'game_stop'>> => {
  allowed();
  return tools().game_stop(input);
};
export const gameReload = async (input: McpToolInput<'game_reload'>): Promise<McpToolOutput<'game_reload'>> => {
  allowed();
  return tools().game_reload(input);
};
export const gameInput = async (input: McpToolInput<'game_input'>): Promise<McpToolOutput<'game_input'>> => {
  allowed();
  return tools().game_input(input);
};
export const gameImportAsset = async (input: McpToolInput<'game_import_asset'>): Promise<McpToolOutput<'game_import_asset'>> => {
  allowed();
  return tools().game_import_asset(input);
};
