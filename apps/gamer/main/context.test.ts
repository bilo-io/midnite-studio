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
async function setup(options: { granted?: boolean; paired?: boolean; host?: GamerElectron['gameAgentHost'] } = {}) {
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
    // Never the user's ~/Midnite Games.
    defaultGamesRoot: join(dir, 'games'),
    ...(options.host ? { gameAgentHost: options.host } : {}),
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
      contents: () => null,
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

  it('answers a Model-tab agent engine "not available" — Gamer runs agents only for game runs', async () => {
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

  it('answers the agent channels "not available" — no agent host is composed', async () => {
    const { invoke, services } = await setup();
    expect(services.gameAgents).toBeNull();
    expect(await invoke(CHANNELS.gamesAgentCancel, { gameId: 'g' })).toMatchObject({ ok: false, message: expect.stringContaining('not available') });
  });

  it('serves the agent channels from the game agent service once a host is composed, starting nothing', async () => {
    const host = { startServer: vi.fn(), shimLaunch: vi.fn(), resolveAgent: vi.fn(), runCli: vi.fn() };
    const { invoke, services } = await setup({ host });
    expect(services.gameAgents).not.toBeNull();
    expect(await invoke(CHANNELS.gamesAgentCancel, { gameId: 'g' })).toMatchObject({ ok: false, message: 'No agent is working on this game.' });
    expect(await invoke(CHANNELS.gamesAgentRun, { gameId: 'nope', prompt: 'x', engine: { kind: 'agent', agentId: 'claude' }, passes: 1 })).toMatchObject({
      ok: false,
      message: 'That game was not found.',
    });
    expect(host.startServer).not.toHaveBeenCalled();
    expect(host.runCli).not.toHaveBeenCalled();
  });

  it('lists and runs a game’s play-tests as Studio does, recording a result in playtests/results/', async () => {
    const { dir, invoke } = await setup();
    const game = join(dir, 'games', 'ball');
    await mkdir(join(game, 'playtests'), { recursive: true });
    await writeFile(join(game, 'midnite-game.json'), '{}');
    const walk = { version: 1, name: 'walk', replay: 'replays/walk.replay.json', asserts: [{ frame: 1, kind: 'state', path: '$.x', op: 'exists' }] };
    await writeFile(join(game, 'playtests', 'walk.json'), JSON.stringify(walk));
    await writeFile(join(game, 'playtests', 'broken.json'), '{');
    const { games } = (await invoke(CHANNELS.gamesList)) as { games: { gameId: string }[] };
    const gameId = games[0]!.gameId;

    const listed = (await invoke(CHANNELS.gamesPlaytests, { gameId })) as { ok: true; value: { playtests: { name: string; valid: boolean }[] } };
    expect(listed.value.playtests.map((p) => [p.name, p.valid])).toEqual([['broken', false], ['walk', true]]);

    // The replay file is missing, so the run reports a named error — the same result shape Studio's menu shows.
    const ran = (await invoke(CHANNELS.gamesPlaytestRun, { gameId, names: ['walk'] })) as { ok: true; value: { passed: boolean; runs: { name: string; error?: string }[] } };
    expect(ran).toMatchObject({ ok: true, value: { passed: false, runs: [{ name: 'walk', error: expect.stringContaining('replays/walk.replay.json') }] } });
    const listedAgain = (await invoke(CHANNELS.gamesPlaytests, { gameId })) as { value: { playtests: { name: string; last: unknown }[] } };
    expect(listedAgain.value.playtests.find((p) => p.name === 'walk')?.last).toMatchObject({ name: 'walk', passed: false });
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
