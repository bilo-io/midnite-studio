import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveConflictWholeFile } from './conflict-resolve';
import { TempRepo } from '../testing/temp-repo';

async function read(repo: TempRepo, relative: string): Promise<string> {
  return readFile(join(repo.path, relative), 'utf8');
}

/**
 * `resolveConflictWholeFile` is a thin wrapper around real git plumbing
 * (`cat-file blob` off an index stage, then `add`), so it is only worth
 * proving against real git — a fixture-string unit test would just restate
 * the implementation.
 *
 * The rebase case is the whole reason Theme B exists as a tested item rather
 * than a one-line helper: git's own index-stage convention flips "ours" and
 * "theirs" for a rebase relative to what the person who typed `git rebase`
 * would call their own branch, and nothing here corrects for that — this
 * suite is what proves the raw `:2:`/`:3:` pass-through is still the right
 * answer.
 */
describe('resolveConflictWholeFile — merge', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  async function setUpMergeConflict(): Promise<void> {
    await repo.commitFile('f.txt', 'ORIGINAL\n', 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('f.txt', 'FEATURE\n', 'feature edit');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('f.txt', 'MAIN\n', 'main edit');
    const merge = await repo.gitAllowFailure(['merge', 'feature']);
    expect(merge.exitCode).not.toBe(0);
  }

  it('accepts ours — the current branch, stage :2:', async () => {
    await setUpMergeConflict();

    const result = await resolveConflictWholeFile(repo.path, 'f.txt', 'ours');

    expect(result.ok).toBe(true);
    await expect(read(repo, 'f.txt')).resolves.toBe('MAIN\n');
    expect((await repo.gitAllowFailure(['diff', '--name-only', '--diff-filter=U'])).stdout).toBe('');
  });

  it('accepts theirs — the branch being merged in, stage :3:', async () => {
    await setUpMergeConflict();

    const result = await resolveConflictWholeFile(repo.path, 'f.txt', 'theirs');

    expect(result.ok).toBe(true);
    await expect(read(repo, 'f.txt')).resolves.toBe('FEATURE\n');
  });

  it('accepts base — the common ancestor, stage :1:', async () => {
    await setUpMergeConflict();

    const result = await resolveConflictWholeFile(repo.path, 'f.txt', 'base');

    expect(result.ok).toBe(true);
    await expect(read(repo, 'f.txt')).resolves.toBe('ORIGINAL\n');
  });

  it('stages the resolved content — the file no longer reads as unmerged', async () => {
    await setUpMergeConflict();

    await resolveConflictWholeFile(repo.path, 'f.txt', 'theirs');

    const staged = await repo.git(['show', ':0:f.txt']);
    expect(staged).toBe('FEATURE\n');
  });

  it('fails with a named reason on an add/add conflict, which has no common ancestor', async () => {
    await repo.commitFile('unrelated.txt', 'x\n', 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('new.txt', 'FEATURE\n', 'add on feature');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('new.txt', 'MAIN\n', 'add on main');
    const merge = await repo.gitAllowFailure(['merge', 'feature']);
    expect(merge.exitCode).not.toBe(0);

    const result = await resolveConflictWholeFile(repo.path, 'new.txt', 'base');

    if (result.ok || result.kind !== 'error') {
      throw new Error(`expected an error result, got ${JSON.stringify(result)}`);
    }
    expect(result.message).toContain('base');
  });
});

describe('resolveConflictWholeFile — rebase inverts ours/theirs relative to merge', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  /**
   * Two separate `it`s, not one calling both sides on the same path: `git
   * add` (inside `resolveConflictWholeFile`, via `stagePaths`) resolves the
   * conflict entirely — it collapses stages 1/2/3 into one stage-0 entry —
   * so a second call against the same already-resolved path would have
   * nothing left to read.
   */
  async function setUpRebaseConflict(repo: TempRepo): Promise<void> {
    await repo.commitFile('f.txt', 'ORIGINAL\n', 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('f.txt', 'FEATURE\n', 'feature edit');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('f.txt', 'MAIN\n', 'main edit');
    await repo.git(['checkout', 'feature']);

    const rebase = await repo.gitAllowFailure(['rebase', 'main']);
    expect(rebase.exitCode).not.toBe(0);
  }

  it("'ours' is the branch being rebased ONTO, not the branch the user is rebasing", async () => {
    await setUpRebaseConflict(repo);

    // The person who ran `git rebase main` while on `feature` would call
    // FEATURE "mine" — but git's own :2:/:3: convention during a rebase
    // calls the upstream (main, MAIN) "ours" and the replayed commit
    // (FEATURE) "theirs". This function passes that through unmodified.
    const result = await resolveConflictWholeFile(repo.path, 'f.txt', 'ours');
    expect(result.ok).toBe(true);
    await expect(read(repo, 'f.txt')).resolves.toBe('MAIN\n');
  });

  it("'theirs' is the commit being replayed — the user's own branch content", async () => {
    await setUpRebaseConflict(repo);

    const result = await resolveConflictWholeFile(repo.path, 'f.txt', 'theirs');
    expect(result.ok).toBe(true);
    await expect(read(repo, 'f.txt')).resolves.toBe('FEATURE\n');
  });
});
