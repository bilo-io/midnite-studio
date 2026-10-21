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

import { mediaMapMain, type MapRuntime } from './main';
import { mediaMapManifest } from './manifest';

/** The channels never reach the runtime in these tests: a bad payload is answered before a service is called. */
const runtime = new Proxy({} as MapRuntime, {
  get: () => () => {
    throw new Error('the runtime must not be reached');
  },
});

describe('media-map MCP ownership', () => {
  /** The Maps tab's own tools; `map_generate`, `map_get` and `map_patch` are Sprites' (a sprite-kind map). */
  const tools = ['map_list', 'map_measure', 'map_goto', 'map_capture_terrain'] as const;

  it('declares exactly the Maps tools, owned by Gamer', () => {
    expect([...mediaMapManifest.mcpTools]).toEqual([...tools]);
    for (const id of tools) expect(mcpToolOwner(id, [mediaMapManifest])).toBe('gamer');
  });

  it('Studio lists every tool, a Gamer-only install lists the Maps ones, a Creator-only one none', () => {
    const manifests = [mediaMapManifest];
    expect(listMcpToolIds(ALL_APPS_INSTALLED, manifests)).toEqual([...MCP_TOOL_IDS]);
    expect(listMcpToolIds(installedSet(['gamer']), manifests)).toEqual(expect.arrayContaining([...tools]));
    expect(listMcpToolIds(installedSet(['creator']), manifests).some((id) => (tools as readonly string[]).includes(id))).toBe(false);
  });
});

/** The template's contract: manifest, placement and the main half agree. */
describe('media-map manifest', () => {
  it('belongs to the media folder, composed by Gamer (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-map']).toEqual({ folder: mediaMapManifest.feature, placement: 'gamer' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaMapManifest.feature])).toContain(mediaMapManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaMapManifest.views).toEqual([]);
  });

  it('names only real map channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaMapManifest.ipc, ...mediaMapManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:map-/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    const ctx = createRecordingContext();
    mediaMapMain.register(ctx, { runtime });
    expect([...ctx.channels].sort()).toEqual([...mediaMapManifest.ipc].sort());
  });

  it('answers a bad payload with the envelope, never a throw', async () => {
    const ctx = createRecordingContext();
    mediaMapMain.register(ctx, { runtime });
    expect(await ctx.invoke(CHANNELS.mediaMapGet, {})).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaMapCapture, { nope: true })).toMatchObject({ ok: false });
  });
});
