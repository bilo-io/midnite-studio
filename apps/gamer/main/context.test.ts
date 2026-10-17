// @vitest-environment node
// vitest, not Playwright: handler registration is logic over an injected ipcMain — no browser needed.
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { mediaCoreManifest } from '@midnite/studio-feature-media-core/main';
import { mediaGameManifest } from '@midnite/studio-feature-media-game/main';
import { mediaMapManifest } from '@midnite/studio-feature-media-map/main';
import { mediaSpriteManifest } from '@midnite/studio-feature-media-sprite/main';
import { mediaTerrainManifest } from '@midnite/studio-feature-media-terrain/main';
import { CHANNELS, mstudioFileUrl } from '@midnite/studio-shared';

import { GAMER_REPO_ID, registerGamerHandlers, type GamerElectron, type GamerServices } from './context';
import { resolveGamerFileUrl } from './file-protocol';

const dirs: string[] = [];
const live: GamerServices[] = [];
afterEach(async () => {
  for (const services of live.splice(0)) {
    services.media.stopWatchers();
    services.map.dispose();
    services.terrain.dispose();
    services.games.stopAll();
  }
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Everything the app would hand in from Electron, replaced by something that touches nothing real. */
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'gamer-media-'));
  dirs.push(dir);
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
  return { dir, handlers, invoke, spawned };
}

describe('registerGamerHandlers', () => {
  it('registers exactly media-core, Maps, Terrain, Sprites and Games channels', async () => {
    const { handlers } = await setup();
    expect([...handlers.keys()].sort()).toEqual(
      [...mediaCoreManifest.ipc, ...mediaMapManifest.ipc, ...mediaTerrainManifest.ipc, ...mediaSpriteManifest.ipc, ...mediaGameManifest.ipc].sort(),
    );
  });

  it('spawns no worker and no game at registration — they start on demand', async () => {
    const { spawned } = await setup();
    expect(spawned).not.toHaveBeenCalled();
  });

  it('has no stored key: only the keyless tile sources are available', async () => {
    const { invoke } = await setup();
    const result = (await invoke(CHANNELS.mediaMapSources)) as { sources: { id: string; available: boolean }[] };
    expect(result.sources.some((s) => s.available)).toBe(true);
    expect(result.sources.some((s) => !s.available)).toBe(true);
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
