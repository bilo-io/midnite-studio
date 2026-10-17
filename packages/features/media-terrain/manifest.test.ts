import { createRecordingContext } from '@midnite/studio-runtime';
import {
  ALL_APPS_INSTALLED,
  CHANNELS,
  EVENT_CHANNELS,
  FEATURE_PACKAGE_SPLITS,
  FEATURE_PLACEMENT,
  installedSet,
  listMcpToolIds,
  MCP_TOOL_IDS,
  mcpToolOwner,
  placementOwners,
} from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { mediaTerrainMain, type TerrainService } from './main';
import { mediaTerrainManifest } from './manifest';

/** A bad payload is answered before a service is called, so no method may be reached. */
const service = new Proxy({} as TerrainService, {
  get: () => () => {
    throw new Error('the service must not be reached');
  },
});

describe('media-terrain MCP ownership', () => {
  const tools = MCP_TOOL_IDS.filter((id) => id.startsWith('terrain_'));

  it('declares exactly the terrain_* tools, owned by Gamer', () => {
    expect([...mediaTerrainManifest.mcpTools].sort()).toEqual([...tools].sort());
    for (const id of tools) expect(mcpToolOwner(id, [mediaTerrainManifest])).toBe('gamer');
  });

  it('Studio lists every tool, a Gamer-only install lists the terrain ones, a Creator-only one none', () => {
    const manifests = [mediaTerrainManifest];
    expect(listMcpToolIds(ALL_APPS_INSTALLED, manifests)).toEqual([...MCP_TOOL_IDS]);
    expect(listMcpToolIds(installedSet(['gamer']), manifests)).toEqual(expect.arrayContaining(tools));
    expect(listMcpToolIds(installedSet(['creator']), manifests).some((id) => tools.includes(id))).toBe(false);
  });
});

/** The template's contract: manifest, placement and the main half agree. */
describe('media-terrain manifest', () => {
  it('belongs to the media folder, composed by Gamer (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-terrain']).toEqual({ folder: mediaTerrainManifest.feature, placement: 'gamer' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaTerrainManifest.feature])).toContain(mediaTerrainManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaTerrainManifest.views).toEqual([]);
  });

  it('names only real terrain channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaTerrainManifest.ipc, ...mediaTerrainManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:terrain-/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    const ctx = createRecordingContext();
    mediaTerrainMain.register(ctx, { service });
    expect([...ctx.channels].sort()).toEqual([...mediaTerrainManifest.ipc].sort());
  });

  it('answers a bad payload with the envelope, never a throw', async () => {
    const ctx = createRecordingContext();
    mediaTerrainMain.register(ctx, { service });
    expect(await ctx.invoke(CHANNELS.mediaTerrainGet, {})).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaTerrainBuild, { nope: true })).toMatchObject({ ok: false });
  });
});
