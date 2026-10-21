import { TERRAINS_OFF_MESSAGE, type McpToolInput, type McpToolOutput } from '@midnite/studio-shared';

import type { TerrainTools } from '../media/terrain/terrain-mcp';
import { McpToolError } from './errors';
import { getMcpAllowTerrains } from './ui-gate';

/**
 * The `terrain_*` tools as the app's global MCP server answers them (Phase 105 Theme J): the
 * implementations in `media/terrain/terrain-mcp.ts`, wrapped in the consent model every other
 * state-changing tool has. The tools that change a terrain, run a build or write an export refuse
 * with a named reason while `Settings ▸ MCP ▸ Let agents edit terrains` is off; the read tools and
 * the preview render answer whenever the server is on.
 *
 * The implementations are bound at startup (`setTerrainTools`, from `ipc/media-terrain-handlers.ts`,
 * where the media store lives); until then a call is answered, not thrown, with a plain error.
 */

let bound: TerrainTools | null = null;

export function setTerrainTools(tools: TerrainTools | null): void {
  bound = tools;
}

function tools(): TerrainTools {
  if (!bound) throw new McpToolError('error', 'Media ▸ Terrain is not ready yet.');
  return bound;
}

function allowed(): void {
  if (!getMcpAllowTerrains()) throw new McpToolError('refused', TERRAINS_OFF_MESSAGE);
}

export const terrainList = async (input: McpToolInput<'terrain_list'>): Promise<McpToolOutput<'terrain_list'>> => tools().terrain_list(input);
export const terrainGetSpec = async (input: McpToolInput<'terrain_get_spec'>): Promise<McpToolOutput<'terrain_get_spec'>> =>
  tools().terrain_get_spec(input);
export const terrainRenderPreview = async (input: McpToolInput<'terrain_render_preview'>): Promise<McpToolOutput<'terrain_render_preview'>> =>
  tools().terrain_render_preview(input);
export const terrainGetStats = async (input: McpToolInput<'terrain_get_stats'>): Promise<McpToolOutput<'terrain_get_stats'>> =>
  tools().terrain_get_stats(input);

export const terrainOpen = async (input: McpToolInput<'terrain_open'>): Promise<McpToolOutput<'terrain_open'>> => {
  allowed();
  return tools().terrain_open(input);
};
export const terrainSetSpec = async (input: McpToolInput<'terrain_set_spec'>): Promise<McpToolOutput<'terrain_set_spec'>> => {
  allowed();
  return tools().terrain_set_spec(input);
};
export const terrainSetInput = async (input: McpToolInput<'terrain_set_input'>): Promise<McpToolOutput<'terrain_set_input'>> => {
  allowed();
  return tools().terrain_set_input(input);
};
export const terrainBuild = async (input: McpToolInput<'terrain_build'>): Promise<McpToolOutput<'terrain_build'>> => {
  allowed();
  return tools().terrain_build(input);
};
export const terrainExport = async (input: McpToolInput<'terrain_export'>): Promise<McpToolOutput<'terrain_export'>> => {
  allowed();
  return tools().terrain_export(input);
};
