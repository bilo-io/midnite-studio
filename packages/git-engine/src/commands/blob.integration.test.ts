import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { readBlob } from './blob';

/**
 * Real git, real bytes. The point of these is the thing a fixture cannot prove:
 * that binary content survives the round trip byte for byte. `execGit` hands
 * stdout back as a string and would corrupt it, which is why `readBlob` spawns.
 */
describe('readBlob', () => {
  let repo: TempRepo;
  /** Every byte value, so any encoding pass over the stream shows up. */
  const oldBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const newBytes = Buffer.concat([oldBytes, Buffer.from([0, 255, 0])]);

  beforeAll(async () => {
    repo = await TempRepo.create();
    await repo.commitFile('readme.md', 'first\n', 'chore: init');

    await writeFile(join(repo.path, 'shot.png'), oldBytes);
    await repo.git(['add', '--', 'shot.png']);
    await repo.commit('feat: add the shot');

    // Committed once more, so HEAD~ / HEAD / index / worktree all differ.
    await writeFile(join(repo.path, 'shot.png'), newBytes);
    await repo.git(['add', '--', 'shot.png']);
    await repo.commit('feat: retake the shot');
  });

  afterAll(async () => {
    await repo.cleanup();
  });

  it('returns a binary blob byte for byte', async () => {
    const read = await readBlob(repo.path, 'HEAD', 'shot.png', { maxBytes: 1024 });
    expect(read.ok).toBe(true);
    expect(read.ok && read.bytes.equals(newBytes)).toBe(true);
  });

  it('reads the pre-image from the parent revision', async () => {
    const read = await readBlob(repo.path, 'HEAD^', 'shot.png', { maxBytes: 1024 });
    expect(read.ok && read.bytes.equals(oldBytes)).toBe(true);
  });

  it("reads the index with git's own `:path` syntax", async () => {
    await writeFile(join(repo.path, 'shot.png'), Buffer.from([9, 9, 9]));
    await repo.git(['add', '--', 'shot.png']);

    // The index now holds the three-byte version and HEAD still holds the old
    // one — which is exactly the pairing an unstaged image diff shows.
    const index = await readBlob(repo.path, ':', 'shot.png', { maxBytes: 1024 });
    expect(index.ok && [...index.bytes]).toEqual([9, 9, 9]);
    const head = await readBlob(repo.path, 'HEAD', 'shot.png', { maxBytes: 1024 });
    expect(head.ok && head.bytes.equals(newBytes)).toBe(true);
  });

  it('reports a path that does not exist at that revision as missing', async () => {
    const read = await readBlob(repo.path, 'HEAD', 'nope.png', { maxBytes: 1024 });
    expect(read).toEqual({ ok: false, reason: 'missing' });
  });

  it('reports the root commit having no parent as missing, not as a crash', async () => {
    const root = (await repo.git(['rev-list', '--max-parents=0', 'HEAD'])).trim();
    const read = await readBlob(repo.path, `${root}^`, 'readme.md', { maxBytes: 1024 });
    expect(read).toEqual({ ok: false, reason: 'missing' });
  });

  it('refuses a blob over the ceiling instead of buffering it', async () => {
    const read = await readBlob(repo.path, 'HEAD', 'shot.png', { maxBytes: 8 });
    expect(read).toEqual({ ok: false, reason: 'too-large' });
  });

  it('refuses a flag-shaped object rather than handing it to git', async () => {
    const read = await readBlob(repo.path, '-upload-pack', 'shot.png', { maxBytes: 1024 });
    expect(read).toEqual({ ok: false, reason: 'missing' });
  });
});
