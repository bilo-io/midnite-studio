// @vitest-environment node
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

import { createSpriteRuntime, mediaSpriteMain, type SpriteRuntimeDeps } from './main';
import { mediaSpriteManifest } from './manifest';

/** Deps that touch nothing: no media store, no provider, no model engine, no window. */
const deps = (over: Partial<SpriteRuntimeDeps> = {}): SpriteRuntimeDeps => ({
  rootFor: async () => null,
  writeBytes: async () => ({ ok: true, value: undefined }),
  trash: async () => undefined,
  toPng: async () => null,
  onChanged: () => undefined,
  emitProgress: () => undefined,
  emitChanged: () => undefined,
  log: () => undefined,
  generateImage: async () => {
    throw new Error('no image provider in a unit test');
  },
  visionCall: async () => {
    throw new Error('no vision model in a unit test');
  },
  llmCall: async () => {
    throw new Error('no engine in a unit test');
  },
  bakeSplat: async () => null,
  terrainRootFor: async () => null,
  sendRenderRequest: () => false,
  ...over,
});

const register = (over: Partial<SpriteRuntimeDeps> = {}) => {
  const ctx = createRecordingContext();
  mediaSpriteMain.register(ctx, { runtime: createSpriteRuntime(deps(over)), pickTiledMap: async () => null });
  return ctx;
};

describe('media-sprite MCP ownership', () => {
  /** `sprite_*`, `tileset_generate`, `background_generate`, and the sprite-kind `map_generate` / `map_get` / `map_patch`. */
  const tools = MCP_TOOL_IDS.filter(
    (id) => id.startsWith('sprite_') || id === 'tileset_generate' || id === 'background_generate' || ['map_generate', 'map_get', 'map_patch'].includes(id),
  );

  it('declares exactly the sprite tools, owned by Gamer', () => {
    expect([...mediaSpriteManifest.mcpTools].sort()).toEqual([...tools].sort());
    for (const id of tools) expect(mcpToolOwner(id, [mediaSpriteManifest])).toBe('gamer');
  });

  it('Studio lists every tool, a Gamer-only install lists the sprite ones, a Creator-only one none', () => {
    const manifests = [mediaSpriteManifest];
    expect(listMcpToolIds(ALL_APPS_INSTALLED, manifests)).toEqual([...MCP_TOOL_IDS]);
    expect(listMcpToolIds(installedSet(['gamer']), manifests)).toEqual(expect.arrayContaining(tools));
    expect(listMcpToolIds(installedSet(['creator']), manifests).some((id) => tools.includes(id))).toBe(false);
  });
});

/** The template's contract: manifest, placement and the main half agree. */
describe('media-sprite manifest', () => {
  it('belongs to the media folder, composed by Gamer (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-sprite']).toEqual({ folder: mediaSpriteManifest.feature, placement: 'gamer' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaSpriteManifest.feature])).toContain(mediaSpriteManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaSpriteManifest.views).toEqual([]);
  });

  it('names only real sprite channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaSpriteManifest.ipc, ...mediaSpriteManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:sprite-/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    expect([...register().channels].sort()).toEqual([...mediaSpriteManifest.ipc].sort());
  });

  it('answers a bad payload with the envelope, never a throw', async () => {
    const ctx = register();
    expect(await ctx.invoke(CHANNELS.mediaSpriteGet, {})).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaSpriteGenerate, { nope: true })).toMatchObject({ ok: false });
  });
});

describe('media-sprite main half', () => {
  it('the Tiled import picker being dismissed is a quiet no-op, not an error', async () => {
    const ctx = register();
    expect(await ctx.invoke(CHANNELS.mediaSpriteImportMap, { repoId: 'r1' })).toEqual({ ok: true, value: {} });
  });
});
