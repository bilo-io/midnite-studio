import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_TOOL_IDS, PLACEMENT_APP_IDS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMcpToolListing } from './installed-apps';
import { installedAppsFromLauncherFile, launcherInstalledFile, readInstalledApps } from './launcher-installed';

/** The Model feature's manifest claims `model_list` for Gamer (Phase 113 Theme S); a stub says the same here. */
const manifests = [{ owner: 'gamer', mcpTools: ['model_list'] }] as const;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'installed-apps-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeState(ids: string[], appData = root): string {
  const file = launcherInstalledFile(appData);
  mkdirSync(join(file, '..'), { recursive: true });
  const apps = ids.map((id) => ({ id, version: '1.0.0', bundlePath: '/b', stubPath: '/s' }));
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, apps }));
  return file;
}

describe('launcherInstalledFile', () => {
  it("is the launcher's userData bundles/installed.json under the injected dir", () => {
    expect(launcherInstalledFile('/a')).toBe('/a/Midnite Apps/bundles/installed.json');
  });
});

describe('readInstalledApps', () => {
  it('returns [] for a missing file', () => {
    expect(readInstalledApps(join(root, 'nope.json'))).toEqual([]);
  });

  it('returns [] for malformed JSON and for the wrong shape', () => {
    const bad = join(root, 'bad.json');
    writeFileSync(bad, '{not json');
    expect(readInstalledApps(bad)).toEqual([]);
    writeFileSync(bad, JSON.stringify({ schemaVersion: 2, apps: [] }));
    expect(readInstalledApps(bad)).toEqual([]);
  });

  it('keeps known ids and drops ones this suite does not know', () => {
    expect(readInstalledApps(writeState(['cleaner', 'mystery', 'gamer']))).toEqual(['cleaner', 'gamer']);
  });
});

describe('installedAppsFromLauncherFile', () => {
  it('a recorded bundle has its tools listed; an unrecorded one does not', () => {
    const file = writeState(['gamer']);
    const listing = createMcpToolListing({ installed: installedAppsFromLauncherFile({ file, provided: [] }), manifests });
    expect(listing.isListed('model_list')).toBe(true);
    expect(listing.isListed('forge.pulls')).toBe(false);
    expect(listing.isListed('repo.list')).toBe(true); // frame tools: every app
  });

  it('an uninstall filters the tools on the next list, no restart', () => {
    const file = writeState(['gamer']);
    const listing = createMcpToolListing({ installed: installedAppsFromLauncherFile({ file, provided: [] }), manifests });
    expect(listing.isListed('model_list')).toBe(true);
    writeState(['agents']);
    expect(listing.isListed('model_list')).toBe(false);
    expect(listing.isListed('forge.pulls')).toBe(true);
  });

  it('a missing or malformed file leaves only what the host provides', () => {
    const missing = join(root, 'missing.json');
    const none = createMcpToolListing({ installed: installedAppsFromLauncherFile({ file: missing, provided: [] }), manifests });
    expect(none.isListed('model_list')).toBe(false);
    const bad = join(root, 'bad.json');
    writeFileSync(bad, 'garbage');
    const agents = createMcpToolListing({ installed: installedAppsFromLauncherFile({ file: bad, provided: ['agents'] }), manifests });
    expect(agents.isListed('forge.pulls')).toBe(true);
    expect(agents.isListed('model_list')).toBe(false);
  });

  it('Studio as host (provides every app) still lists everything, with or without a file', () => {
    for (const file of [join(root, 'missing.json'), writeState([])]) {
      const listing = createMcpToolListing({
        installed: installedAppsFromLauncherFile({ file, provided: PLACEMENT_APP_IDS }),
      });
      expect(listing.list()).toEqual([...MCP_TOOL_IDS]);
    }
  });
});
