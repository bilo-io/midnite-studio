import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TempRepo } from '@midnite/studio-git-engine';

import { defaultGamesRoot, effectiveGamesRoot, validateGamesRoot } from './games-root';

let plain: string;
let repo: TempRepo;

beforeAll(async () => {
  plain = await realpath(await mkdtemp(join(tmpdir(), 'midnite-games-root-')));
  repo = await TempRepo.create();
});

afterAll(async () => {
  await rm(plain, { recursive: true, force: true });
  await repo.cleanup();
});

describe('games root', () => {
  it('defaults to ~/Midnite Games', () => {
    expect(defaultGamesRoot()).toBe(join(homedir(), 'Midnite Games'));
    expect(effectiveGamesRoot(null)).toBe(defaultGamesRoot());
    expect(effectiveGamesRoot('/somewhere/else')).toBe('/somewhere/else');
  });

  it('refuses a relative path', async () => {
    expect(await validateGamesRoot('games')).toBe('Choose a full folder path.');
  });

  it('refuses a folder inside a git working tree, naming the repo', async () => {
    const message = await validateGamesRoot(join(repo.path, 'games'));
    expect(message).toBe(
      `This folder is inside the git repository ${repo.path}. Games are their own repositories — pick a folder outside it.`,
    );
  });

  it('accepts an existing writable folder and one that does not exist yet', async () => {
    expect(await validateGamesRoot(plain)).toBeNull();
    expect(await validateGamesRoot(join(plain, 'not', 'yet'))).toBeNull();
  });

  it('refuses a folder it cannot write to', async () => {
    // A file where a folder should be: access(W_OK) on a read-only file is the portable stand-in.
    const file = join(plain, 'readonly.txt');
    await writeFile(file, 'x', { mode: 0o444 });
    // Running as root makes W_OK pass anywhere, so only assert the message when the OS enforces it.
    const message = await validateGamesRoot(file);
    if (process.getuid?.() !== 0) expect(message).toBe("Midnite Studio can't write to this folder.");
  });
});
