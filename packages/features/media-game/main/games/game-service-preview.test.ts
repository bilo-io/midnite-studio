// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '@midnite/studio-git-engine';
import { GAME_MANIFEST_FILE } from '@midnite/studio-shared';

import { gameIdForPath } from './game-scaffold';
import { createGameService, type GameServiceDeps } from './game-service';

vi.setConfig({ testTimeout: 30_000 });

const MANIFEST = { version: 1, name: 'G', engine: 'phaser', dimension: '2d', perspective: 'platformer', genre: null, starter: 'blank', kitVersion: '0.13.0' };
const LEVEL = {
  type: 'map',
  orientation: 'orthogonal',
  infinite: false,
  width: 2,
  height: 1,
  tilewidth: 32,
  tileheight: 32,
  layers: [{ id: 1, type: 'tilelayer', name: 'ground', width: 2, height: 1, data: [1, 0] }],
  tilesets: [{ firstgid: 1, name: 'tiles', image: 'tiles.png', imagewidth: 64, imageheight: 32, tilewidth: 32, tileheight: 32, columns: 2, tilecount: 2, margin: 0, spacing: 0 }],
};

let base: string;
let repo: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'midnite-preview-')));
  repo = join(base, 'game');
  await mkdir(join(repo, 'levels'), { recursive: true });
  await execGit(repo, ['init', '--initial-branch=main', '--', '.'], { write: true });
  await execGit(repo, ['config', 'user.email', 't@example.com'], { write: true });
  await execGit(repo, ['config', 'user.name', 'T'], { write: true });
  await writeFile(join(repo, GAME_MANIFEST_FILE), `${JSON.stringify(MANIFEST, null, 2)}\n`, 'utf8');
  await writeFile(join(repo, 'levels', 'cave.tmj'), `${JSON.stringify(LEVEL)}\n`, 'utf8');
  await execGit(repo, ['add', '-A'], { write: true });
  await execGit(repo, ['commit', '-m', 'init'], { write: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function setup(running = false) {
  const run = vi.fn(async () => ({ ok: true as const, value: { runId: 'r1' } }));
  const clearPreview = vi.fn();
  const deps = {
    settings: { load: async () => ({ version: 1, gamesRoot: base }), save: async () => undefined },
    runner: { run, clearPreview, isRunning: () => running, stop: vi.fn() },
    templateDir: '',
    enginesDir: '',
    registerRepo: async () => ({ ok: true as const }),
    listRepoPaths: async () => [repo],
    send: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as GameServiceDeps;
  return { service: createGameService(deps), run, clearPreview, gameId: await gameIdForPath(repo) };
}

const status = async (): Promise<string> => (await execGit(repo, ['status', '--porcelain'])).stdout.trim();

describe('service.levels.preview (Phase 140 Theme B)', () => {
  it('runs the unsaved level through the runner overlay and leaves git status clean', async () => {
    const { service, run, gameId } = await setup();
    const moved = { ...LEVEL, width: 3 };
    const result = await service.levels.preview({ gameId, scene: 'cave', level: moved, spawn: { x: 64, y: 32 } });
    expect(result).toEqual({ ok: true, value: { url: 'mstudio-game://' + gameId + '/index.html?midnite-level=cave&midnite-spawn=64%2C32', via: 'started' } });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ level: 'cave', spawn: { x: 64, y: 32 }, preview: { scene: 'cave', json: expect.stringContaining('"width": 3') } }));
    expect(await status()).toBe('');
    expect((await execGit(repo, ['log', '--format=%s'])).stdout.trim()).toBe('init');
  });

  it('answers restarted for a running game and refuses an invalid level without running', async () => {
    const { service, run, gameId } = await setup(true);
    expect((await service.levels.preview({ gameId, scene: 'cave', level: LEVEL, spawn: null }))).toMatchObject({ ok: true, value: { via: 'restarted' } });
    run.mockClear();
    const bad = await service.levels.preview({ gameId, scene: 'cave', level: { nope: 1 }, spawn: null });
    expect(bad.ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('previewEnd drops the overlay', async () => {
    const { service, clearPreview, gameId } = await setup();
    expect(service.levels.previewEnd(gameId)).toEqual({ ok: true });
    expect(clearPreview).toHaveBeenCalledWith(gameId);
  });

  it('saving a scene ends its preview before the write', async () => {
    const { service, clearPreview, gameId } = await setup();
    const saved = await service.levels.set(gameId, 'cave', { ...LEVEL, width: 4 });
    expect(saved.ok).toBe(true);
    expect(clearPreview).toHaveBeenCalledWith(gameId, 'cave');
  });
});
