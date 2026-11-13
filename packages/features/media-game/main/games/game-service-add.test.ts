// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
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
