import { describe, expect, it } from 'vitest';

import { CHANNELS, EVENT_CHANNELS, FEATURE_PLACEMENT, featurePackagePlacement, placementOwners } from '@midnite/studio-shared';

import { mcpToolsManifest } from './manifest';

/** The template's contract (see the monitor's): manifest and shared registrations agree. */
describe('mcp-tools manifest', () => {
  it('is a package split out of the agent folder, owned by the app the placement map names', () => {
    expect(mcpToolsManifest.feature).toBe('agent');
    expect(placementOwners(FEATURE_PLACEMENT[mcpToolsManifest.feature])[0]).toBe(mcpToolsManifest.owner);
    expect(featurePackagePlacement('mcp-tools')).toBe(mcpToolsManifest.owner);
  });

  it('contributes no view of its own — it is rendered by the app that composes it', () => {
    expect(mcpToolsManifest.views).toEqual([]);
  });

  it('names the three mcp channels, the two agent-audit channels, the breaker answer and the two MCP trust channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of mcpToolsManifest.ipc) {
      expect(known.has(channel), channel).toBe(true);
      expect(channel).toMatch(/^mstudio:(mcp|agent-audit|agent-limits|mcp-trust):/);
    }
    expect(mcpToolsManifest.ipc).toHaveLength(8);
    expect(mcpToolsManifest.events).toEqual([EVENT_CHANNELS.agentLimitTripped]);
  });
});
