import { MAPS_OFF_MESSAGE, type McpToolInput, type McpToolOutput } from '@midnite/studio-shared';

import type { MapTools } from '../media/map/map-mcp';
import { McpToolError } from './errors';
import { getMcpAllowMaps } from './ui-gate';

/**
 * The `map_*` tools as the app's global MCP server answers them (Phase 108 Theme I): the
 * implementations in `media/map/map-mcp.ts`, wrapped in the consent model every other state-changing
 * tool has. `map_goto` (moves the user's view) and `map_capture_terrain` (writes files, creates a
 * terrain) refuse with a named reason while `Settings ▸ MCP ▸ Let agents capture maps` is off;
 * `map_list` and `map_measure` answer whenever the server is on.
 *
 * The implementations are bound at startup (`setMapTools`, from `ipc/media-map-handlers.ts`, where the
 * map and capture services live); until then a call is answered, not thrown, with a plain error.
 */

let bound: MapTools | null = null;

export function setMapTools(tools: MapTools | null): void {
  bound = tools;
}

function tools(): MapTools {
  if (!bound) throw new McpToolError('error', 'Media ▸ Maps is not ready yet.');
  return bound;
}

function allowed(): void {
  if (!getMcpAllowMaps()) throw new McpToolError('refused', MAPS_OFF_MESSAGE);
}

export const mapList = async (input: McpToolInput<'map_list'>): Promise<McpToolOutput<'map_list'>> => tools().map_list(input);
export const mapMeasure = async (input: McpToolInput<'map_measure'>): Promise<McpToolOutput<'map_measure'>> => tools().map_measure(input);

export const mapGoto = async (input: McpToolInput<'map_goto'>): Promise<McpToolOutput<'map_goto'>> => {
  allowed();
  return tools().map_goto(input);
};
export const mapCaptureTerrain = async (input: McpToolInput<'map_capture_terrain'>): Promise<McpToolOutput<'map_capture_terrain'>> => {
  allowed();
  return tools().map_capture_terrain(input);
};
