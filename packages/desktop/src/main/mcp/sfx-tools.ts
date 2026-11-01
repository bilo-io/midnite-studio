import { MUSIC_OFF_MESSAGE, type McpToolInput, type McpToolOutput } from '@midnite/studio-shared';

import type { SfxMcpTools } from '@midnite/studio-feature-media-audio/main';

import { McpToolError } from './errors';
import { getMcpAllowMusic } from './ui-gate';

/**
 * `sfx_status` / `sfx_generate` as the global MCP server answers them — Media ▸ SFX's local Stable Audio Open
 * Small, bound by `ipc/media-sfx-handlers.ts`. Generating writes takes into the repository, so it sits behind
 * the same `Settings ▸ MCP ▸ Let agents edit music` switch as Audio's write tools; the status answers whenever
 * the server is on. Neither tool can install the model or accept its licence — only the user, in the tab.
 */
let bound: SfxMcpTools | null = null;

export function setSfxTools(tools: SfxMcpTools | null): void {
  bound = tools;
}

function tools(): SfxMcpTools {
  if (!bound) throw new McpToolError('error', 'Media ▸ SFX is not ready yet.');
  return bound;
}

export const sfxStatus = async (input: McpToolInput<'sfx_status'>): Promise<McpToolOutput<'sfx_status'>> => tools().sfx_status(input);
export const sfxGenerate = async (input: McpToolInput<'sfx_generate'>): Promise<McpToolOutput<'sfx_generate'>> => {
  if (!getMcpAllowMusic()) throw new McpToolError('refused', MUSIC_OFF_MESSAGE);
  return tools().sfx_generate(input);
};
