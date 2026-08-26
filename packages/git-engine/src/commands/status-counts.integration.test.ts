import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { readStatusCounts } from './status-counts';

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
});

afterEach(async () => {
  await repo.cleanup();
});

/** Counts for one path on one side — the lookup the panels actually do. */
const at = (rows: { path: string; insertions: number; deletions: number }[], path: string) =>
  rows.find((row) => row.path === path);

describe('readStatusCounts', () => {
  it('reports a partially staged file differently on each side', async () => {
    await repo.commitFile('a.txt', 'one\ntwo\nthree\n', 'seed');

    // Stage one edit, then make another on top of it. The two sides are now
    // genuinely different numbers, which is the whole reason they are separate
    // lists rather than one.
    await repo.writeFile('a.txt', 'ONE\ntwo\nthree\n');
    await repo.git(['add', '--', 'a.txt']);
    await repo.writeFile('a.txt', 'ONE\ntwo\nTHREE\nfour\n');

    const counts = await readStatusCounts(repo.path);

    expect(at(counts.staged, 'a.txt')).toEqual({ path: 'a.txt', insertions: 1, deletions: 1 });
    expect(at(counts.unstaged, 'a.txt')).toEqual({ path: 'a.txt', insertions: 2, deletions: 1 });
  });

  it('counts an untracked file as pure insertions, which no git diff reports', async () => {
    await repo.commitFile('seed.txt', 'x\n', 'seed');
    await mkdir(join(repo.path, 'src'), { recursive: true });
    await repo.writeFile('src/new.ts', 'a\nb\nc\n');

    const counts = await readStatusCounts(repo.path);

    // The case the whole `ls-files` branch exists for: `git diff` says nothing
    // about a file git has never seen, so the row would read `+0 −0`.
    expect(at(counts.unstaged, 'src/new.ts')).toEqual({
      path: 'src/new.ts',
      insertions: 3,
      deletions: 0,
    });
  });

  it('counts a final line with no trailing newline', async () => {
    await repo.commitFile('seed.txt', 'x\n', 'seed');
    await repo.writeFile('no-newline.txt', 'only line');

    expect(at((await readStatusCounts(repo.path)).unstaged, 'no-newline.txt')?.insertions).toBe(1);
  });

  it('reports an untracked binary file as zero, the way --numstat does', async () => {
    await repo.commitFile('seed.txt', 'x\n', 'seed');
    await writeFile(join(repo.path, 'logo.bin'), Buffer.from([0x89, 0x50, 0x00, 0x0a, 0x0a]));

    expect(at((await readStatusCounts(repo.path)).unstaged, 'logo.bin')).toEqual({
      path: 'logo.bin',
      insertions: 0,
      deletions: 0,
    });
  });

  it('leaves ignored files out entirely', async () => {
    await repo.commitFile('.gitignore', 'ignored/\n', 'seed');
    await mkdir(join(repo.path, 'ignored'), { recursive: true });
    await repo.writeFile('ignored/huge.txt', 'a\n'.repeat(1000));

    const counts = await readStatusCounts(repo.path);
    expect(counts.unstaged.map((row) => row.path)).not.toContain('ignored/huge.txt');
  });

  it('keys a rename on the post-image path, which is what the rows are keyed on', async () => {
    await repo.commitFile('old.txt', 'a\nb\nc\nd\ne\n', 'seed');
    await repo.git(['mv', 'old.txt', 'new.txt']);

    const counts = await readStatusCounts(repo.path);
    // A pure rename moves no lines, so the assertion that matters is that the
    // row exists under the destination path rather than the source.
    expect(at(counts.staged, 'new.txt')).toBeDefined();
    expect(at(counts.staged, 'old.txt')).toBeUndefined();
  });

  it('reports nothing at all for a clean checkout', async () => {
    await repo.commitFile('a.txt', 'x\n', 'seed');
    expect(await readStatusCounts(repo.path)).toEqual({ staged: [], unstaged: [] });
  });
});
