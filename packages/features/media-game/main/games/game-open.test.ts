// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '@midnite/studio-git-engine';
import { GAME_MANIFEST_FILE } from '@midnite/studio-shared';

import { resolveGameFolder } from './game-open';

vi.setConfig({ testTimeout: 30_000 });

let base: string;
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'midnite-open-')));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function repo(name: string, manifest: string | null): Promise<string> {
  const dir = join(base, name);
  await mkdir(join(dir, 'src'), { recursive: true });
  await execGit(dir, ['init', '--initial-branch=main', '--', '.'], { write: true });
  if (manifest !== null) await writeFile(join(dir, GAME_MANIFEST_FILE), manifest, 'utf8');
  return dir;
}

describe('resolveGameFolder', () => {
  it('refuses a relative path', async () => {
    expect(await resolveGameFolder('games/mine')).toMatchObject({ ok: false, message: 'Choose a full folder path.' });
  });

  it('refuses something that is not a folder', async () => {
    const file = join(base, 'notes.txt');
    await writeFile(file, 'x', 'utf8');
    expect(await resolveGameFolder(file)).toMatchObject({ ok: false, message: '"notes.txt" is not a folder.' });
    expect(await resolveGameFolder(join(base, 'missing'))).toMatchObject({ ok: false, message: '"missing" is not a folder.' });
  });

  it('refuses a folder that is not a git repository', async () => {
    const dir = join(base, 'plain');
    await mkdir(dir);
    const result = await resolveGameFolder(dir);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok && result.kind === 'error') expect(result.message).toBe('"plain" is not a git repository. A game is its own repository — run git init in it, or start a new game with New game.');
  });

  it('opens the repository root for a game, and for a folder inside it', async () => {
    const dir = await repo('my-game', '{}');
    expect(await resolveGameFolder(dir)).toEqual({ ok: true, value: { root: dir } });
    expect(await resolveGameFolder(join(dir, 'src'))).toEqual({ ok: true, value: { root: dir } });
  });

  it('still resolves an invalid manifest, so it can be fixed', async () => {
    const dir = await repo('broken', '{ not json');
    expect(await resolveGameFolder(dir)).toEqual({ ok: true, value: { root: dir } });
  });

  it('resolves a folder outside any games root', async () => {
    const dir = await repo('elsewhere', '{"name":"x"}');
    expect((await resolveGameFolder(dir)).ok).toBe(true);
  });

  it('refuses a manifest inside a bigger repository, naming that repository', async () => {
    const top = await repo('mono', null);
    const nested = join(top, 'games', 'inner');
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, GAME_MANIFEST_FILE), '{}', 'utf8');
    const result = await resolveGameFolder(nested);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok && result.kind === 'error') expect(result.message).toBe(`"inner" is inside the repository ${top}. Games are their own repositories — move it out, or open ${top} if that is the game.`);
  });

  it('refuses a repository with no manifest', async () => {
    const dir = await repo('empty', null);
    const result = await resolveGameFolder(dir);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok && result.kind === 'error') expect(result.message).toBe('No midnite-game.json in "empty". Open Game adds an existing Midnite game; to start one, use New game.');
  });
});
