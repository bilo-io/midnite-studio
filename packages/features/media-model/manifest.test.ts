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
import { describe, expect, it, vi } from 'vitest';

import { createModelRuntime, mediaModelMain, type ModelRuntimeDeps } from './main';
import { mediaModelManifest } from './manifest';

/** Deps that touch nothing: no media store, no Ollama, no agent, no window. */
const deps = (over: Partial<ModelRuntimeDeps> = {}): ModelRuntimeDeps => ({
  rootFor: async () => null,
  createGroup: async () => ({ ok: true, value: undefined }),
  trash: async () => undefined,
  author: async () => ({ name: 'tester' }),
  writeBytes: async () => ({ ok: true, value: undefined }),
  readBytes: async () => ({ ok: false, kind: 'error', message: 'no file in a unit test' }),
  onChanged: () => undefined,
  emit: () => undefined,
  ollama: {
    chat: async () => {
      throw new Error('no Ollama in a unit test');
    },
    tags: async () => {
      throw new Error('no Ollama in a unit test');
    },
    capabilities: async () => [],
  },
  ...over,
});

const register = (over: Partial<ModelRuntimeDeps> = {}, pickSavePath = async (): Promise<string | null> => null) => {
  const ctx = createRecordingContext();
  const sf3d = vi.fn(async () => ({ ok: true as const, value: undefined }));
  mediaModelMain.register(ctx, { runtime: createModelRuntime(deps(over)), pickSavePath, sf3d });
  return { ctx, sf3d };
};

/** The template's contract: manifest, placement and the main half agree. */
describe('media-model manifest', () => {
  it('belongs to the media folder, composed by Gamer (and Studio)', () => {
    expect(FEATURE_PACKAGE_SPLITS['media-model']).toEqual({ folder: mediaModelManifest.feature, placement: 'gamer' });
    expect(placementOwners(FEATURE_PLACEMENT[mediaModelManifest.feature])).toContain(mediaModelManifest.owner);
  });

  it('is a tab, not a view', () => {
    expect(mediaModelManifest.views).toEqual([]);
  });

  it('names only real model channels', () => {
    const known = new Set<string>([...Object.values(CHANNELS), ...Object.values(EVENT_CHANNELS)]);
    for (const channel of [...mediaModelManifest.ipc, ...mediaModelManifest.events]) {
      expect(known.has(channel), channel).toBe(true);
      expect(/^mstudio:media:model-/.test(channel), channel).toBe(true);
    }
  });

  it('has a main half that registers exactly its channels', () => {
    expect([...register().ctx.channels].sort()).toEqual([...mediaModelManifest.ipc].sort());
  });

  it('answers a bad payload with the envelope, never a throw', async () => {
    const { ctx } = register();
    expect(await ctx.invoke(CHANNELS.mediaModelGenerate, {})).toMatchObject({ ok: false });
    expect(await ctx.invoke(CHANNELS.mediaModelSaveEdit, { nope: true })).toMatchObject({ ok: false });
  });
});

describe('media-model MCP ownership', () => {
  const tools = MCP_TOOL_IDS.filter((id) => id.startsWith('model_'));

  it('declares exactly the model_* tools, owned by Gamer', () => {
    expect([...mediaModelManifest.mcpTools].sort()).toEqual([...tools].sort());
    for (const id of tools) expect(mcpToolOwner(id, [mediaModelManifest])).toBe('gamer');
  });

  it('Studio lists every tool, a Gamer-only install lists the model ones, a Creator-only one none', () => {
    const manifests = [mediaModelManifest];
    expect(listMcpToolIds(ALL_APPS_INSTALLED, manifests)).toEqual([...MCP_TOOL_IDS]);
    expect(listMcpToolIds(installedSet(['gamer']), manifests)).toEqual(expect.arrayContaining(tools));
    expect(listMcpToolIds(installedSet(['creator']), manifests).some((id) => tools.includes(id))).toBe(false);
  });
});

describe('media-model main half', () => {
  it('the SF3D channel goes to the composer-supplied dispatcher', async () => {
    const { ctx, sf3d } = register();
    await ctx.invoke(CHANNELS.mediaModelSf3d, { op: 'status' });
    expect(sf3d).toHaveBeenCalledWith({ op: 'status' });
  });

  it('with Ollama down, the engine picker says so instead of throwing', async () => {
    const { ctx } = register();
    expect(await ctx.invoke(CHANNELS.mediaModelProviders)).toMatchObject({ providers: { ollama: { available: false } } });
  });

  it('an agent engine in an app with no agents is a plain "not available", not a crash', async () => {
    const llm = createModelRuntime(deps()).engines.runAgent;
    expect(await llm({ agentId: 'claude', model: undefined, repoId: 'r', prompt: 'x' })).toMatchObject({ ok: false });
  });

  it('an export whose save dialog is dismissed answers "cancelled" and writes nothing', async () => {
    const pick = vi.fn(async () => null);
    const { ctx } = register({}, pick);
    const result = await ctx.invoke(CHANNELS.mediaModelExport, {
      repoId: 'r',
      project: 'p',
      path: 'fox.json',
      format: 'glb',
      spec: { name: 'fox', parts: [{ name: 'body', shape: 'box', size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' }] },
    });
    expect(result).toMatchObject({ ok: false, message: 'cancelled' });
    expect(pick).toHaveBeenCalledOnce();
  });
});
