// @vitest-environment node
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, GAME_MANIFEST_FILE } from '@midnite/studio-shared';

import { gameIdForPath } from './game-scaffold';
import { createGameService, type GameServiceDeps } from './game-service';

vi.setConfig({ testTimeout: 30_000 });

let base: string;
let game: string;
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'midnite-add-')));
  game = join(base, 'elsewhere', 'mine');
  await mkdir(game, { recursive: true });
  await execGit(game, ['init', '--initial-branch=main', '--', '.'], { write: true });
  await writeFile(join(game, GAME_MANIFEST_FILE), '{}', 'utf8');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function setup(overrides: Partial<GameServiceDeps> = {}, repos: string[] = []) {
  const registerRepo = vi.fn(async (path: string) => {
    repos.push(path);
    return { ok: true as const };
  });
  const send = vi.fn();
  const deps = {
    settings: { load: async () => ({ version: 1, gamesRoot: join(base, 'root') }), save: async () => undefined },
    runner: {},
    templateDir: '',
    enginesDir: '',
    registerRepo,
    listRepoPaths: async () => repos,
    send,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  } as unknown as GameServiceDeps;
  return { service: createGameService(deps), registerRepo, send };
}

describe('game service add (Open Game)', () => {
  it('answers cancelled when the dialog is dismissed', async () => {
    const { service, registerRepo } = setup({ pickFolder: async () => null });
    expect(await service.add()).toEqual({ ok: true, value: { status: 'cancelled' } });
    expect(registerRepo).not.toHaveBeenCalled();
  });

  it('fails plainly with no picker and no path', async () => {
    const { service } = setup();
    expect(await service.add()).toMatchObject({ ok: false, message: 'Open Game is not available here.' });
  });

  it('adds a folder: registers it once and sends gamesChanged added', async () => {
    const { service, registerRepo, send } = setup({ pickFolder: async () => game });
    expect(await service.add()).toEqual({ ok: true, value: { status: 'added', gameId: await gameIdForPath(game), path: game } });
    expect(registerRepo).toHaveBeenCalledTimes(1);
    expect(registerRepo).toHaveBeenCalledWith(game);
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'added' });
  });

  it('answers listed, writing nothing, when the game is already in the list', async () => {
    const { service, registerRepo, send } = setup({}, [game]);
    expect(await service.add(game)).toEqual({ ok: true, value: { status: 'listed', gameId: await gameIdForPath(game), path: game } });
    expect(registerRepo).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('passes a refusal and a registerRepo failure through unchanged', async () => {
    const { service } = setup();
    expect(await service.add(join(base, 'nope'))).toMatchObject({ ok: false, message: '"nope" is not a folder.' });
    const failing = setup({ registerRepo: async () => ({ ok: false, kind: 'error', message: 'repo list is locked' }) });
    expect(await failing.service.add(game)).toMatchObject({ ok: false, message: 'repo list is locked' });
    expect(failing.send).not.toHaveBeenCalled();
  });
});

describe('game service add: a folder with no manifest (Phase 149 Theme F)', () => {
  let bare: string;
  beforeEach(async () => {
    bare = join(base, 'elsewhere', 'synth');
    await mkdir(bare, { recursive: true });
    await execGit(bare, ['init', '--initial-branch=main', '--', '.'], { write: true });
    await execGit(bare, ['config', 'user.email', 't@example.com'], { write: true });
    await execGit(bare, ['config', 'user.name', 'T'], { write: true });
    await writeFile(join(bare, 'package.json'), JSON.stringify({ name: 'synth-surf', dependencies: { three: '^0.185.1' } }), 'utf8');
    await writeFile(join(bare, 'index.html'), '<html></html>', 'utf8');
    await execGit(bare, ['add', '-A'], { write: true });
    await execGit(bare, ['commit', '-m', 'init'], { write: true });
  });

  it('proposes an inferred manifest and registers nothing', async () => {
    const { service, registerRepo, send } = setup();
    const result = await service.add(bare);
    expect(result).toMatchObject({ ok: true, value: { status: 'needs-manifest', path: bare, proposed: { name: 'Synth Surf', engine: 'three', dimension: '3d' } } });
    if (result.ok && result.value.status === 'needs-manifest') expect(result.value.diagnosis.hasManifest).toBe(false);
    expect(registerRepo).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('fails when the folder is not a Phaser or three.js game', async () => {
    await writeFile(join(bare, 'package.json'), '{"name":"x"}', 'utf8');
    const { service } = setup();
    expect(await service.add(bare)).toMatchObject({ ok: false, message: 'Only Phaser and three.js games are supported.' });
  });

  it('writes the confirmed manifest as one commit, then registers and answers added', async () => {
    const { service, registerRepo, send } = setup();
    const proposed = await service.add(bare);
    if (!proposed.ok || proposed.value.status !== 'needs-manifest') throw new Error('expected needs-manifest');
    const edited = { ...proposed.value.proposed, name: 'Synth Surf!' };
    const before = (await execGit(bare, ['rev-list', '--count', 'HEAD'])).stdout.trim();
    const result = await service.add(bare, edited);
    expect(result).toEqual({ ok: true, value: { status: 'added', gameId: await gameIdForPath(bare), path: bare } });
    expect(registerRepo).toHaveBeenCalledWith(bare);
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'added' });
    expect((await execGit(bare, ['rev-list', '--count', 'HEAD'])).stdout.trim()).toBe(String(Number(before) + 1));
    expect((await execGit(bare, ['show', '--name-only', '--format=%s', 'HEAD'])).stdout.trim().split('\n').filter(Boolean)).toEqual(['chore(midnite): add midnite-game.json', GAME_MANIFEST_FILE]);
    expect(JSON.parse(await readFile(join(bare, GAME_MANIFEST_FILE), 'utf8'))).toMatchObject({ name: 'Synth Surf!' });
  });
});

describe('game service doctorFix (Phase 149 Theme D)', () => {
  it('refuses an unknown game id and a relative path; applies a fix by absolute path', async () => {
    const { service, send } = setup();
    expect(await service.doctorFix({ gameId: 'gnope', fixId: 'set-genre', genre: null })).toMatchObject({ ok: false, message: 'That game was not found.' });
    expect(await service.doctorFix({ path: 'rel', fixId: 'set-genre', genre: null })).toMatchObject({ ok: false, message: 'Give a game id or an absolute folder path.' });
    await execGit(game, ['config', 'user.email', 't@example.com'], { write: true });
    await execGit(game, ['config', 'user.name', 'T'], { write: true });
    await writeFile(join(game, GAME_MANIFEST_FILE), JSON.stringify({ version: 1, name: 'M', engine: 'phaser', dimension: '2d', perspective: 'platformer', genre: 'fps', starter: 'custom', kitVersion: '0.12.0', vendored: {} }), 'utf8');
    await execGit(game, ['add', '-A'], { write: true });
    await execGit(game, ['commit', '-m', 'init'], { write: true });
    const result = await service.doctorFix({ path: game, fixId: 'set-genre', genre: null });
    expect(result).toMatchObject({ ok: true, value: { commit: expect.any(String), diagnosis: { hasManifest: true } } });
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
  });
});
