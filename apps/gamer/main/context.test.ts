// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain — no browser needed.
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { mediaCoreManifest } from '@midnite/studio-feature-media-core/main';
import { mediaGameManifest } from '@midnite/studio-feature-media-game/main';
import { mediaMapManifest } from '@midnite/studio-feature-media-map/main';
import { mediaModelManifest } from '@midnite/studio-feature-media-model/main';
import { mediaSpriteManifest } from '@midnite/studio-feature-media-sprite/main';
import { mediaTerrainManifest } from '@midnite/studio-feature-media-terrain/main';
import { createFakeCipher, startTestVaultHost, testPairingIdentity, type TestVaultHost } from '@midnite/studio-runtime';
import { CHANNELS, mstudioFileUrl } from '@midnite/studio-shared';

import { GAMER_REPO_ID, registerGamerHandlers, type GamerElectron, type GamerServices } from './context';
import { resolveGamerFileUrl } from './file-protocol';

const dirs: string[] = [];
const live: GamerServices[] = [];
const hosts: TestVaultHost[] = [];
/** This app's pairing key, as its own pairing.ts would keep it — a random seed, no keychain. */
const PAIRING_KEY = testPairingIdentity();
const MAPTILER = 'media.mapTilerApiKey';
const SECRET = 'mt-super-secret';
afterEach(async () => {
  for (const services of live.splice(0)) {
    services.media.stopWatchers();
    services.map.dispose();
    services.terrain.dispose();
    services.games.stopAll();
    services.close();
  }
  await Promise.all(hosts.splice(0).map((host) => host.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/**
 * Everything the app would hand in from Electron, replaced by something that touches nothing real. The
 * runtime host is Studio's side of the vault (its own fake cipher) holding the MapTiler key; Gamer holds no
 * cipher and reads it over the host's socket — only once `granted`.
 */
async function setup(options: { granted?: boolean; paired?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'gamer-media-'));
  dirs.push(dir);
  await mkdir(join(dir, 'runtime'));
  const host = await startTestVaultHost({ runtimeDirectory: join(dir, 'runtime'), cipher: createFakeCipher() });
  hosts.push(host);
  await host.studio.set('secrets', MAPTILER, SECRET);
  if (options.granted) host.grants.set('gamer', 'secrets', [MAPTILER]);
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const spawned = vi.fn(() => {
    throw new Error('no worker in a unit test');
  });
  const el: GamerElectron = {
    ipcMain: { handle: (c, l) => void handlers.set(c, l), on: (c, l) => void handlers.set(c, l) },
    trashItem: async () => undefined,
    send: () => undefined,
    mediaRoot: dir,
    userData: dir,
    vaultDirectory: join(dir, 'runtime'),
    pairing: () => (options.paired === false ? null : PAIRING_KEY),
    hasWindow: () => false,
    revealPath: () => undefined,
    pickSavePath: async () => null,
    pickTiledMap: async () => null,
    ffmpegStatus: async () => ({ found: false, reason: 'none' }),
    fetch: async () => {
      throw new Error('no network in tests');
    },
    userAgent: 'Test/1',
    nativeDecode: async () => null,
    toPng: async () => null,
    spawnCaptureWorker: spawned,
    spawnTerrainWorker: spawned,
    game: {
      electron: {
        sessionFromPartition: () => {
          throw new Error('no session in a unit test');
        },
        createView: () => {
          throw new Error('no view in a unit test');
        },
        cancelDownload: () => undefined,
        fetchFile: async () => {
          throw new Error('no network in tests');
        },
      },
      getWindow: () => null,
      templateDir: join(dir, 'no-templates'),
      enginesDir: join(dir, 'no-engines'),
    },
    log: () => undefined,
  };
  const services = registerGamerHandlers(el);
  live.push(services);
  const invoke = (channel: string, payload?: unknown) => handlers.get(channel)!({}, payload);
  return { dir, handlers, invoke, spawned, host, services };
}

describe('registerGamerHandlers', () => {
  it('registers exactly media-core, Maps, Terrain, Sprites, Models and Games channels', async () => {
    const { handlers } = await setup();
    expect([...handlers.keys()].sort()).toEqual(
      [
        ...mediaCoreManifest.ipc,
        ...mediaMapManifest.ipc,
        ...mediaTerrainManifest.ipc,
        ...mediaSpriteManifest.ipc,
        ...mediaModelManifest.ipc,
        ...mediaGameManifest.ipc,
      ].sort(),
    );
  });

  it('spawns no worker and no game at registration — they start on demand', async () => {
    const { spawned } = await setup();
    expect(spawned).not.toHaveBeenCalled();
  });

  it('is denied the MapTiler key by default — no grant, so only the keyless tile sources are available', async () => {
    const { invoke } = await setup();
    const result = (await invoke(CHANNELS.mediaMapSources)) as { sources: { id: string; available: boolean }[] };
    expect(result.sources.some((s) => s.available)).toBe(true);
    expect(result.sources.some((s) => !s.available)).toBe(true);
  });

  it('is denied the key when it has not paired, even granted — pairing and grants, never either', async () => {
    const { invoke } = await setup({ granted: true, paired: false });
    const result = (await invoke(CHANNELS.mediaMapSources)) as { sources: { available: boolean }[] };
    expect(result.sources.some((s) => !s.available)).toBe(true);
  });

  it('reads the MapTiler key once the user grants Gamer the name in Vault, and no answer contains it', async () => {
    const { invoke } = await setup({ granted: true });
    const result = (await invoke(CHANNELS.mediaMapSources)) as { sources: { id: string; available: boolean }[] };
    expect(result.sources.every((s) => s.available)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('is never asked for anything beyond its three keys, even granted a whole namespace', async () => {
    const { host, invoke } = await setup();
    await host.studio.set('secrets', 'agent.claude.apiKey', 'sk-agent');
    host.grants.set('gamer', 'secrets', '*');
    const result = await invoke(CHANNELS.mediaMapSources);
    expect(JSON.stringify(result)).not.toContain('sk-agent');
  });

  it('answers a refused SF3D status as "unavailable" with a reason, and refuses its other ops', async () => {
    const { invoke } = await setup();
    expect(await invoke(CHANNELS.mediaModelSf3d, { op: 'status' })).toMatchObject({ ok: true, value: { state: 'unavailable', reason: expect.stringContaining('Midnite Studio') } });
    expect(await invoke(CHANNELS.mediaModelSf3d, { op: 'install' })).toMatchObject({ ok: false });
  });

  it('answers an agent engine "not available" — Gamer runs no agent', async () => {
    const { services } = await setup();
    expect(await services.model.engines.runAgent({ agentId: 'claude', model: undefined, repoId: GAMER_REPO_ID, prompt: 'x' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('not available'),
    });
  });

  it('scopes the model library to the gamer repo and lists nothing in an empty media root', async () => {
    const { invoke } = await setup();
    expect(await invoke(CHANNELS.mediaModelLibrary, { op: 'list', repoId: 'someone-else' })).toEqual({ ok: true, value: { tree: [] } });
    expect(await invoke(CHANNELS.mediaModelLibrary, { op: 'list', repoId: GAMER_REPO_ID })).toEqual({ ok: true, value: { tree: [] } });
  });

  it('answers the agent and play-test channels "not available" — those need the Model tab and MCP', async () => {
    const { invoke } = await setup();
    expect(await invoke(CHANNELS.gamesAgentCancel, { gameId: 'g' })).toMatchObject({ ok: false });
    expect(await invoke(CHANNELS.gamesPlaytests, { gameId: 'g' })).toBeDefined();
  });

  it('scopes media to the one gamer repo', async () => {
    const { invoke } = await setup();
    expect(await invoke(CHANNELS.mediaProjectList, { repoId: 'someone-else', tab: 'map' })).toMatchObject({ ok: false });
    expect(await invoke(CHANNELS.mediaProjectList, { repoId: GAMER_REPO_ID, tab: 'map' })).toMatchObject({ ok: true });
  });
});

describe('resolveGamerFileUrl', () => {
  it('serves a file under the media root and refuses anything outside it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gamer-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'gamer-outside-'));
    dirs.push(root, outside);
    await writeFile(join(root, 'a.png'), 'x');
    await writeFile(join(outside, 'secret.txt'), 's');
    await symlink(outside, join(root, 'link'));
    expect(await resolveGamerFileUrl(mstudioFileUrl('repo', GAMER_REPO_ID, 'a.png'), root)).toMatch(/a\.png$/);
    expect(await resolveGamerFileUrl(mstudioFileUrl('repo', GAMER_REPO_ID, '../x'), root)).toBeNull();
    expect(await resolveGamerFileUrl(mstudioFileUrl('repo', GAMER_REPO_ID, 'link/secret.txt'), root)).toBeNull();
    expect(await resolveGamerFileUrl(mstudioFileUrl('repo', 'other', 'a.png'), root)).toBeNull();
  });
});
