import { describe, expect, it } from 'vitest';

import { MCP_TOOL_IDS, type McpToolId } from './mcp';
import { PLACEMENT_APP_IDS } from './domain/placement';
import {
  ALL_APPS_INSTALLED,
  defaultMcpToolOwner,
  installedSet,
  listMcpToolIds,
  mcpToolOwner,
  MCP_TOOL_OWNING_APPS,
} from './mcp-tool-owners';

// Vitest/jsdom: pure logic, no browser capability needed.

/**
 * Audio's manifest (`packages/features/media-audio/manifest.ts`) is where the `music_*` tools are
 * claimed for Creator, and the Model, Game, Terrain, Sprite and Map manifests are where Gamer's tools are
 * (Phase 113 Theme S); `shared` cannot import a feature, so these are the same claims by prefix and each
 * feature's own test (`manifest.test.ts`) pins that the real manifest lists exactly these.
 */
const MUSIC_TOOLS = MCP_TOOL_IDS.filter((id) => id.startsWith('music_'));
const GAMER_TOOLS = MCP_TOOL_IDS.filter(
  (id) => /^(model|game|terrain|sprite|map)_/.test(id) || id === 'tileset_generate' || id === 'background_generate',
);
const CREATOR_MANIFEST = { owner: 'creator', mcpTools: MUSIC_TOOLS } as const;
const GAMER_MANIFEST = { owner: 'gamer', mcpTools: GAMER_TOOLS } as const;
const MANIFESTS = [CREATOR_MANIFEST, GAMER_MANIFEST];

/** What an app lists with the Studio manifests passed, as every consumer does. */
const ownerOf = (id: McpToolId) => mcpToolOwner(id, MANIFESTS);
const FRAME_TOOLS: McpToolId[] = MCP_TOOL_IDS.filter((id) => ownerOf(id) === 'frame');
const ownedBy = (app: string): McpToolId[] => MCP_TOOL_IDS.filter((id) => ownerOf(id) === app);

describe('tool listing per installed set', () => {
  it("Studio's full set lists exactly today's registry, in order", () => {
    expect(listMcpToolIds(ALL_APPS_INSTALLED, MANIFESTS)).toEqual([...MCP_TOOL_IDS]);
    // Without the manifests the music and Gamer tools fall to the frame (always listed): nothing is lost, only mis-owned.
    expect(listMcpToolIds(ALL_APPS_INSTALLED)).toEqual([...MCP_TOOL_IDS]);
    expect(listMcpToolIds(installedSet([]))).toEqual(expect.arrayContaining(GAMER_TOOLS));
    expect(listMcpToolIds(installedSet([]), MANIFESTS).some((id) => GAMER_TOOLS.includes(id))).toBe(false);
    // Pinned count: a new tool must be deliberately placed (and this number bumped).
    expect(MCP_TOOL_IDS).toHaveLength(126);
    const histogram: Record<string, number> = {};
    for (const id of MCP_TOOL_IDS) histogram[ownerOf(id)] = (histogram[ownerOf(id)] ?? 0) + 1;
    expect(histogram).toMatchInlineSnapshot(`
      {
        "agents": 4,
        "creator": 14,
        "frame": 21,
        "gamer": 87,
      }
    `);
  });

  it('an empty install lists only the frame tools', () => {
    const listed = listMcpToolIds(installedSet([]), MANIFESTS);
    expect(listed).toEqual(FRAME_TOOLS);
    expect(listed.some((id) => id.startsWith('music_'))).toBe(false);
    expect(listed).toEqual(
      expect.arrayContaining(['repo.list', 'status.get', 'graph.log', 'ui.state', 'companion_settings_get']),
    );
    expect(listed.some((id) => id.startsWith('model_') || id.startsWith('forge.'))).toBe(false);
  });

  it('{gamer} adds the media-for-games tools and nothing of coder or agents', () => {
    const listed = listMcpToolIds(installedSet(['gamer']), MANIFESTS);
    expect(listed).toEqual(MCP_TOOL_IDS.filter((id) => FRAME_TOOLS.includes(id) || ownedBy('gamer').includes(id)));
    expect(listed).toContain('model_list');
    expect(listed).toContain('map_goto');
    expect(listed).not.toContain('forge.pulls');
    expect(listed).not.toContain('workflow_gates_list');
    expect(listed).not.toContain(MUSIC_TOOLS[0]!);
  });

  it('{coder, agents} lists forge and workflow-gate tools but no media tools', () => {
    const listed = listMcpToolIds(installedSet(['coder', 'agents']), MANIFESTS);
    expect(listed).toContain('forge.pulls');
    expect(listed).toContain('forge.checks');
    expect(listed).toContain('workflow_gate_decide');
    expect(listed.some((id) => /^(model|game|terrain|sprite|music)_/.test(id))).toBe(false);
  });

  it('forge tools belong to Agents; a leftover Coder bundle no longer serves them (Phase 124 Theme H)', () => {
    expect(defaultMcpToolOwner('forge.pulls')).toBe('agents');
    expect(listMcpToolIds(installedSet(['agents']), MANIFESTS)).toContain('forge.pulls');
    expect(listMcpToolIds(installedSet(['coder']), MANIFESTS)).not.toContain('forge.pulls');
    expect(listMcpToolIds(installedSet(['gamer']), MANIFESTS)).not.toContain('forge.pulls');
    expect(listMcpToolIds(installedSet(['coder']), MANIFESTS)).not.toContain(MUSIC_TOOLS[0]!);
  });

  it('{creator} lists the music tools and nothing of gamer, coder or agents', () => {
    const listed = listMcpToolIds(installedSet(['creator']), MANIFESTS);
    expect(listed).toEqual(MCP_TOOL_IDS.filter((id) => FRAME_TOOLS.includes(id) || MUSIC_TOOLS.includes(id)));
    expect(listed).toContain('music_add_notes');
    expect(listed).not.toContain('model_list');
  });

  it('two different installed sets give two different lists', () => {
    expect(listMcpToolIds(installedSet(['gamer']))).not.toEqual(listMcpToolIds(installedSet(['agents'])));
  });

  it('every tool resolves to the frame or a real app', () => {
    for (const id of MCP_TOOL_IDS) {
      const owner = ownerOf(id);
      expect(owner === 'frame' || (PLACEMENT_APP_IDS as readonly string[]).includes(owner)).toBe(true);
    }
    // The default table names the apps whose tools no manifest claims yet; Creator's left it for Audio's
    // manifest and Gamer's for its five feature manifests.
    expect([...MCP_TOOL_OWNING_APPS].sort()).toEqual(['agents']);
    expect(MUSIC_TOOLS.every((id) => defaultMcpToolOwner(id) === 'frame')).toBe(true);
    expect(GAMER_TOOLS.every((id) => defaultMcpToolOwner(id) === 'frame')).toBe(true);
  });
});

describe('a feature manifest contributes (and owns) a tool', () => {
  const manifests = [{ owner: 'cleaner', mcpTools: ['status.get'] }] as const;

  it('takes precedence over the default table, so the tool follows its app', () => {
    expect(mcpToolOwner('status.get', manifests)).toBe('cleaner');
    expect(listMcpToolIds(installedSet([]), manifests)).not.toContain('status.get');
    expect(listMcpToolIds(installedSet(['cleaner']), manifests)).toContain('status.get');
  });
});
