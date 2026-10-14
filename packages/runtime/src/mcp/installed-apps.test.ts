import { MCP_TOOL_IDS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { createMcpToolListing, installedAppsFromIds, studioInstalledApps } from './installed-apps';

describe('createMcpToolListing', () => {
  it("Studio's injected source lists every tool, unchanged", () => {
    const listing = createMcpToolListing({ installed: studioInstalledApps });
    expect(listing.list()).toEqual([...MCP_TOOL_IDS]);
  });

  it('two installed sets give two lists, and an unlisted tool is not served', () => {
    const gamer = createMcpToolListing({ installed: installedAppsFromIds(['gamer']) });
    const coder = createMcpToolListing({ installed: installedAppsFromIds(['coder']) });
    expect(gamer.list()).toContain('model_list');
    expect(gamer.list()).not.toContain('forge.pulls');
    expect(coder.list()).toContain('forge.pulls');
    expect(coder.list()).not.toContain('model_list');
    expect(gamer.isListed('model_list')).toBe(true);
    expect(gamer.isListed('forge.pulls')).toBe(false);
    // Frame tools are in both.
    expect(gamer.isListed('repo.list') && coder.isListed('repo.list')).toBe(true);
  });

  it('re-reads the source, so an install shows up without a restart', () => {
    let installed: Parameters<typeof installedAppsFromIds>[0] = [];
    const listing = createMcpToolListing({ installed: () => installedAppsFromIds(installed)() });
    expect(listing.isListed('music_list')).toBe(false);
    installed = ['creator'];
    expect(listing.isListed('music_list')).toBe(true);
  });

  it("a manifest's mcpTools follow the manifest's app", () => {
    const manifests = [{ owner: 'cleaner', mcpTools: ['status.get'] }] as const;
    expect(createMcpToolListing({ installed: installedAppsFromIds([]), manifests }).isListed('status.get')).toBe(false);
    expect(createMcpToolListing({ installed: installedAppsFromIds(['cleaner']), manifests }).isListed('status.get')).toBe(
      true,
    );
  });
});
