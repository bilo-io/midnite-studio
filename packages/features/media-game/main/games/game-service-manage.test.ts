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

const MANIFEST = { version: 1, name: 'Old name', engine: 'phaser', dimension: '2d', perspective: 'platformer', genre: null, starter: 'blank', kitVersion: '0.1.0' };

let base: string;
let root: string;
let elsewhere: string;
let inRoot: string;

async function makeGame(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await execGit(dir, ['init', '--initial-branch=main', '--', '.'], { write: true });
  await execGit(dir, ['config', 'user.email', 't@example.com'], { write: true });
  await execGit(dir, ['config', 'user.name', 'T'], { write: true });
  await writeFile(join(dir, GAME_MANIFEST_FILE), `${JSON.stringify(MANIFEST, null, 2)}\n`, 'utf8');
  await execGit(dir, ['add', '-A'], { write: true });
  await execGit(dir, ['commit', '-m', 'init'], { write: true });
}

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'midnite-manage-')));
  root = join(base, 'root');
  elsewhere = join(base, 'elsewhere', 'mine');
  inRoot = join(root, 'inside');
  await makeGame(elsewhere);
  await makeGame(inRoot);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function setup(overrides: Partial<GameServiceDeps> = {}) {
  const repos = [elsewhere];
  const send = vi.fn();
  const stop = vi.fn();
  const isRunning = vi.fn(() => false);
  const forgetRepo = vi.fn(async (path: string) => {
    repos.splice(repos.indexOf(path), 1);
    return { ok: true as const };
  });
  const registerRepo = vi.fn(async (path: string) => {
    repos.push(path);
    return { ok: true as const };
  });
  const revealPath = vi.fn();
  const trashPath = vi.fn(async () => ({ ok: true as const }));
  const deps = {
    settings: { load: async () => ({ version: 1, gamesRoot: root }), save: async () => undefined },
    runner: { isRunning, stop },
    templateDir: '',
    enginesDir: '',
    registerRepo,
    listRepoPaths: async () => repos,
    forgetRepo,
    revealPath,
    trashPath,
    send,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  } as unknown as GameServiceDeps;
  return { service: createGameService(deps), send, stop, isRunning, forgetRepo, registerRepo, revealPath, trashPath, repos };
}

describe('game service rename', () => {
  it('writes manifest.name only, as one commit, and announces it', async () => {
    const { service, send } = setup();
    const gameId = await gameIdForPath(elsewhere);
    expect(await service.rename(gameId, '  New name  ')).toEqual({ ok: true });
    const manifest = JSON.parse(await readFile(join(elsewhere, GAME_MANIFEST_FILE), 'utf8')) as typeof MANIFEST;
    expect(manifest).toEqual({ ...MANIFEST, name: 'New name' });
    const log = await execGit(elsewhere, ['log', '--format=%s']);
    expect(log.stdout.trim().split('\n')).toEqual(['chore(midnite): rename to New name', 'init']);
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
  });

  it('leaves other uncommitted work out of the commit', async () => {
    await writeFile(join(elsewhere, 'notes.txt'), 'wip', 'utf8');
    const { service } = setup();
    await service.rename(await gameIdForPath(elsewhere), 'Renamed');
    const show = await execGit(elsewhere, ['show', '--name-only', '--format=', 'HEAD']);
    expect(show.stdout.trim()).toBe(GAME_MANIFEST_FILE);
  });

  it('does nothing when the name is unchanged, and refuses an empty one', async () => {
    const { service, send } = setup();
    const gameId = await gameIdForPath(elsewhere);
    expect(await service.rename(gameId, 'Old name')).toEqual({ ok: true });
    expect(await service.rename(gameId, '   ')).toMatchObject({ ok: false });
    expect(send).not.toHaveBeenCalled();
    expect((await execGit(elsewhere, ['rev-list', '--count', 'HEAD'])).stdout.trim()).toBe('1');
  });

  it('fails for an unknown game', async () => {
    expect(await setup().service.rename('nope', 'X')).toMatchObject({ ok: false, message: 'That game was not found.' });
  });
});

describe('game service forget', () => {
  it('removes a game from the list without touching the disk, and announces it', async () => {
    const { service, forgetRepo, send } = setup();
    expect(await service.forget(await gameIdForPath(elsewhere))).toEqual({ ok: true });
    expect(forgetRepo).toHaveBeenCalledWith(elsewhere);
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'removed' });
    expect(await readFile(join(elsewhere, GAME_MANIFEST_FILE), 'utf8')).toContain('Old name');
  });

  it('refuses a game under the games root', async () => {
    const { service, forgetRepo } = setup();
    const result = await service.forget(await gameIdForPath(inRoot));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('always list') });
    expect(forgetRepo).not.toHaveBeenCalled();
  });
});

describe('game service reveal', () => {
  it('shows the folder through the host port', async () => {
    const { service, revealPath } = setup();
    expect(await service.reveal(await gameIdForPath(elsewhere))).toEqual({ ok: true });
    expect(revealPath).toHaveBeenCalledWith(elsewhere);
  });
});

describe('game service delete', () => {
  it('reports the blast radius: uncommitted files, no remote, no upstream, size', async () => {
    await writeFile(join(elsewhere, 'a.txt'), 'a', 'utf8');
    await writeFile(join(elsewhere, 'b.txt'), 'b', 'utf8');
    const { service } = setup();
    const info = await service.deleteInfo(await gameIdForPath(elsewhere));
    expect(info).toMatchObject({ ok: true, value: { path: elsewhere, name: 'Old name', uncommitted: 2, unpushed: null, hasRemote: false } });
    if (info.ok) expect(info.value.bytes).toBeGreaterThan(0);
  });

  it('counts commits not pushed against the upstream', async () => {
    const bare = join(base, 'remote.git');
    await mkdir(bare);
    await execGit(bare, ['init', '--bare', '--initial-branch=main'], { write: true });
    await execGit(elsewhere, ['remote', 'add', 'origin', bare], { write: true });
    await execGit(elsewhere, ['push', '-u', 'origin', 'main'], { write: true });
    await writeFile(join(elsewhere, 'c.txt'), 'c', 'utf8');
    await execGit(elsewhere, ['add', '-A'], { write: true });
    await execGit(elsewhere, ['commit', '-m', 'ahead'], { write: true });
    const info = await setup().service.deleteInfo(await gameIdForPath(elsewhere));
    expect(info).toMatchObject({ ok: true, value: { hasRemote: true, unpushed: 1, uncommitted: 0 } });
  });

  it('refuses a wrong confirm name and touches nothing', async () => {
    const { service, trashPath, forgetRepo } = setup();
    const result = await service.delete(await gameIdForPath(elsewhere), 'old name');
    expect(result).toMatchObject({ ok: false });
    expect(trashPath).not.toHaveBeenCalled();
    expect(forgetRepo).not.toHaveBeenCalled();
  });

  it('forgets, then moves the folder to the Trash exactly once — never rm', async () => {
    const { service, trashPath, forgetRepo, send } = setup();
    expect(await service.delete(await gameIdForPath(elsewhere), 'Old name')).toEqual({ ok: true });
    expect(forgetRepo).toHaveBeenCalledTimes(1);
    expect(trashPath).toHaveBeenCalledTimes(1);
    expect(trashPath).toHaveBeenCalledWith(elsewhere);
    // The port is the only thing that removes: the test's trash is a stub, so the folder is still on disk.
    expect(await readFile(join(elsewhere, GAME_MANIFEST_FILE), 'utf8')).toContain('Old name');
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'removed' });
  });

  it('deletes a game under the games root without forgetting anything', async () => {
    const { service, trashPath, forgetRepo } = setup();
    expect(await service.delete(await gameIdForPath(inRoot), 'Old name')).toEqual({ ok: true });
    expect(forgetRepo).not.toHaveBeenCalled();
    expect(trashPath).toHaveBeenCalledWith(inRoot);
  });

  it('stops a running game first', async () => {
    const { service, stop, isRunning } = setup();
    isRunning.mockReturnValue(true);
    const gameId = await gameIdForPath(elsewhere);
    await service.delete(gameId, 'Old name');
    expect(stop).toHaveBeenCalledWith(gameId);
  });

  it('puts the game back in the list when the Trash refuses', async () => {
    const { service, registerRepo, repos } = setup({ trashPath: async () => ({ ok: false, kind: 'error', message: 'no trash' }) });
    const result = await service.delete(await gameIdForPath(elsewhere), 'Old name');
    expect(result).toMatchObject({ ok: false, message: 'no trash' });
    expect(registerRepo).toHaveBeenCalledWith(elsewhere);
    expect(repos).toContain(elsewhere);
  });

  it('is unavailable without a trash port', async () => {
    const { service, forgetRepo } = setup({ trashPath: undefined });
    expect(await service.delete(await gameIdForPath(elsewhere), 'Old name')).toMatchObject({ ok: false });
    expect(forgetRepo).not.toHaveBeenCalled();
  });
});
