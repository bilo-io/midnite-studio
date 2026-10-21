// @vitest-environment node
import {
  ALL_APPS_INSTALLED,
  installedSet,
  listMcpToolIds,
  MCP_TOOL_IDS,
  mcpToolOwner,
  type McpToolId,
} from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { MCP_TOOL_MANIFESTS } from './tool-manifests';

/**
 * The manifests the MCP server and the stdio shim list tools from (Phase 113 Theme S). Studio is every app
 * installed, so it must list exactly `MCP_TOOL_IDS`; a Gamer-only install lists Gamer's tools and no Creator,
 * Coder or Agents one; a Creator-only install lists the music tools and none of Gamer's.
 */
const GAMER = (id: McpToolId) =>
  /^(model|game|terrain|sprite|map)_/.test(id) || id === 'tileset_generate' || id === 'background_generate';

describe('MCP_TOOL_MANIFESTS', () => {
  it('Studio lists exactly the registry, in order', () => {
    expect(listMcpToolIds(ALL_APPS_INSTALLED, MCP_TOOL_MANIFESTS)).toEqual([...MCP_TOOL_IDS]);
  });

  it('claims every Gamer tool for Gamer and every music tool for Creator, so none reads as a frame tool', () => {
    for (const id of MCP_TOOL_IDS) {
      if (GAMER(id)) expect(mcpToolOwner(id, MCP_TOOL_MANIFESTS), id).toBe('gamer');
      if (id.startsWith('music_')) expect(mcpToolOwner(id, MCP_TOOL_MANIFESTS), id).toBe('creator');
    }
  });

  it('no tool is claimed by two manifests', () => {
    const seen = new Set<string>();
    for (const manifest of MCP_TOOL_MANIFESTS) {
      for (const id of manifest.mcpTools) {
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
  });

  it('a Gamer-only install lists Gamer tools, a Creator-only one lists none of them', () => {
    const gamer = listMcpToolIds(installedSet(['gamer']), MCP_TOOL_MANIFESTS);
    expect(gamer).toEqual(expect.arrayContaining(MCP_TOOL_IDS.filter(GAMER)));
    expect(gamer.some((id) => id.startsWith('music_') || id.startsWith('forge.'))).toBe(false);
    const creator = listMcpToolIds(installedSet(['creator']), MCP_TOOL_MANIFESTS);
    expect(creator.some(GAMER)).toBe(false);
    expect(creator).toContain('music_list');
  });
});
