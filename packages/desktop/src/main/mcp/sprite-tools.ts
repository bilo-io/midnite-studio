import { SPRITES_OFF_MESSAGE, type McpToolInput, type McpToolOutput, type SpriteMcpToolId } from '@midnite/studio-shared';

import type { SpriteTools } from '../media/sprite/sprite-mcp';
import { McpToolError } from './errors';
import { getMcpAllowSprites } from './ui-gate';

/**
 * The sprite tools as the app's global MCP server answers them (Phase 106 Theme K): the
 * implementations in `media/sprite/sprite-mcp.ts`, wrapped in the consent model every other
 * state-changing tool has. The tools that change an asset, start or stop a generation job (paid image
 * or LLM requests) or write an export refuse with a named reason while `Settings ▸ MCP ▸ Let agents
 * edit sprites and maps` is off; the read tools, the job status and the preview answer whenever the
 * server is on.
 *
 * The implementations are bound at startup (`setSpriteTools`, from `ipc/media-sprite-handlers.ts`,
 * where the sprite service lives); until then a call is answered, not thrown, with a plain error.
 */

let bound: SpriteTools | null = null;

export function setSpriteTools(tools: SpriteTools | null): void {
  bound = tools;
}

function tools(): SpriteTools {
  if (!bound) throw new McpToolError('error', 'Media ▸ Sprites is not ready yet.');
  return bound;
}

function allowed(): void {
  if (!getMcpAllowSprites()) throw new McpToolError('refused', SPRITES_OFF_MESSAGE);
}

type Handler<K extends SpriteMcpToolId> = (input: McpToolInput<K>) => Promise<McpToolOutput<K>>;
const read = <K extends SpriteMcpToolId>(id: K): Handler<K> => async (input) => (tools()[id] as unknown as Handler<K>)(input);
const write = <K extends SpriteMcpToolId>(id: K): Handler<K> => async (input) => {
  allowed();
  return (tools()[id] as unknown as Handler<K>)(input);
};

export const spriteList = read('sprite_list');
export const spriteGetSpec = read('sprite_get_spec');
export const spriteRecommendMethod = read('sprite_recommend_method');
export const spriteRenderPreview = read('sprite_render_preview');
export const spriteGetReport = read('sprite_get_report');
export const spriteJobStatus = read('sprite_job_status');
export const mapGet = read('map_get');

export const spriteOpen = write('sprite_open');
export const spriteSetSpec = write('sprite_set_spec');
export const spriteGenerate = write('sprite_generate');
export const spriteRegenerateFrames = write('sprite_regenerate_frames');
export const spritePatchFrames = write('sprite_patch_frames');
export const spriteCancel = write('sprite_cancel');
export const tilesetGenerate = write('tileset_generate');
export const backgroundGenerate = write('background_generate');
export const mapGenerate = write('map_generate');
export const mapPatch = write('map_patch');
export const spriteExport = write('sprite_export');
