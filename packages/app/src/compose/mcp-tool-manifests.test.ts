import { describe, expect, it } from 'vitest';

import { STUDIO_MCP_TOOL_MANIFESTS } from './mcp-tool-manifests';

// Vitest/jsdom: pure data, no browser capability needed.

/**
 * Settings ▸ MCP's manifests (Phase 113 Theme S) are the renderer's copy of the server's list
 * (`desktop/src/main/mcp/tool-manifests.ts`), which the app cannot import. They must name the same
 * manifests — the server lists tools from one list, the Tools page from the other.
 */
describe('STUDIO_MCP_TOOL_MANIFESTS', () => {
  it('claims the music tools for Creator and Gamer\'s tools for Gamer', () => {
    const byOwner: Record<string, number> = {};
    for (const manifest of STUDIO_MCP_TOOL_MANIFESTS) byOwner[manifest.owner] = (byOwner[manifest.owner] ?? 0) + manifest.mcpTools.length;
    expect(Object.keys(byOwner).sort()).toEqual(['creator', 'gamer']);
    expect(byOwner['creator']).toBe(14);
    expect(byOwner['gamer']).toBe(87);
  });
});
