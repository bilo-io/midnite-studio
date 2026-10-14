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

const FRAME_TOOLS: McpToolId[] = MCP_TOOL_IDS.filter((id) => defaultMcpToolOwner(id) === 'frame');
const ownedBy = (app: string): McpToolId[] => MCP_TOOL_IDS.filter((id) => defaultMcpToolOwner(id) === app);

describe('tool listing per installed set', () => {
  it("Studio's full set lists exactly today's registry, in order", () => {
    expect(listMcpToolIds(ALL_APPS_INSTALLED)).toEqual([...MCP_TOOL_IDS]);
    // Pinned count: a new tool must be deliberately placed (and this number bumped).
    expect(MCP_TOOL_IDS).toHaveLength(126);
    const histogram: Record<string, number> = {};
    for (const id of MCP_TOOL_IDS) histogram[defaultMcpToolOwner(id)] = (histogram[defaultMcpToolOwner(id)] ?? 0) + 1;
    expect(histogram).toMatchInlineSnapshot(`
      {
        "agents": 2,
        "coder": 2,
        "creator": 14,
        "frame": 21,
        "gamer": 87,
      }
    `);
  });

  it('an empty install lists only the frame tools', () => {
    const listed = listMcpToolIds(installedSet([]));
    expect(listed).toEqual(FRAME_TOOLS);
    expect(listed).toEqual(
      expect.arrayContaining(['repo.list', 'status.get', 'graph.log', 'ui.state', 'companion_settings_get']),
    );
    expect(listed.some((id) => id.startsWith('model_') || id.startsWith('forge.'))).toBe(false);
  });

  it('{gamer} adds the media-for-games tools and nothing of coder or agents', () => {
    const listed = listMcpToolIds(installedSet(['gamer']));
    expect(listed).toEqual(MCP_TOOL_IDS.filter((id) => FRAME_TOOLS.includes(id) || ownedBy('gamer').includes(id)));
    expect(listed).toContain('model_list');
    expect(listed).toContain('map_goto');
    expect(listed).not.toContain('forge.pulls');
    expect(listed).not.toContain('workflow_gates_list');
    expect(listed).not.toContain('music_list');
  });

  it('{coder, agents} lists forge and workflow-gate tools but no media tools', () => {
    const listed = listMcpToolIds(installedSet(['coder', 'agents']));
    expect(listed).toContain('forge.pulls');
    expect(listed).toContain('forge.checks');
    expect(listed).toContain('workflow_gate_decide');
    expect(listed.some((id) => /^(model|game|terrain|sprite|music)_/.test(id))).toBe(false);
  });

  it('two different installed sets give two different lists', () => {
    expect(listMcpToolIds(installedSet(['gamer']))).not.toEqual(listMcpToolIds(installedSet(['coder'])));
  });

  it('every tool resolves to the frame or a real app', () => {
    for (const id of MCP_TOOL_IDS) {
      const owner = defaultMcpToolOwner(id);
      expect(owner === 'frame' || (PLACEMENT_APP_IDS as readonly string[]).includes(owner)).toBe(true);
    }
    expect([...MCP_TOOL_OWNING_APPS].sort()).toEqual(['agents', 'coder', 'creator', 'gamer']);
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
