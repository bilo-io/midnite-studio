import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { addWorktree, removeWorktree } from './worktree-ops';
import { listWorktrees } from './worktrees';

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
  await repo.commitFile('README.md', '# base\n', 'base');
});

afterEach(async () => {
  await repo.cleanup();
});

describe('addWorktree', () => {
  it('creates a worktree on a new branch', async () => {
    const path = join(repo.path, 'wt-feature');
    const result = await addWorktree(repo.path, {
      path,
      branch: 'feature',
      createBranch: true,
    });

    expect(result).toEqual({ ok: true });
    expect(existsSync(join(path, 'README.md'))).toBe(true);

    const worktrees = await listWorktrees(repo.path, 'r');
    expect(worktrees.map((w) => w.branch)).toEqual(['main', 'feature']);
  });

  it('creates a worktree from an explicit start point', async () => {
    const first = await repo.head();
    await repo.commitFile('later.txt', 'later\n', 'later');

    const path = join(repo.path, 'wt-old');
    expect(
      await addWorktree(repo.path, {
        path,
        branch: 'old',
        createBranch: true,
        startPoint: first,
      }),
    ).toEqual({ ok: true });

    const worktrees = await listWorktrees(repo.path, 'r');
    expect(worktrees.find((w) => w.branch === 'old')?.headSha).toBe(first);
  });

  it('checks out an existing branch without creating one', async () => {
    await repo.git(['branch', 'existing']);
    const path = join(repo.path, 'wt-existing');

    expect(
      await addWorktree(repo.path, { path, branch: 'existing', createBranch: false }),
    ).toEqual({ ok: true });
  });

  it('explains the already-checked-out failure in its own words', async () => {
    // The most common failure by far, and git's wording buries the reason.
    const path = join(repo.path, 'wt-main');
    const result = await addWorktree(repo.path, {
      path,
      branch: 'main',
      createBranch: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toMatch(/already checked out/i);
    expect(result.message).toMatch(/only be checked out once/i);
    expect(result.stderr).toBeTruthy();
  });

  it('explains a branch-name collision', async () => {
    await repo.git(['branch', 'taken']);
    const result = await addWorktree(repo.path, {
      path: join(repo.path, 'wt-taken'),
      branch: 'taken',
      createBranch: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toMatch(/already exists/i);
  });
});

describe('removeWorktree', () => {
  it('removes a clean worktree', async () => {
    const path = join(repo.path, 'wt-clean');
    await addWorktree(repo.path, { path, branch: 'clean', createBranch: true });

    expect(await removeWorktree(repo.path, path)).toEqual({ ok: true });
    expect(existsSync(path)).toBe(false);
    expect((await listWorktrees(repo.path, 'r')).map((w) => w.branch)).toEqual(['main']);
  });

  it('refuses a dirty worktree, and says why', async () => {
    // Git's refusal here is the last thing between a stray click and lost work.
    // The MVP never passes --force, so this path must stay a clear error.
    const path = join(repo.path, 'wt-dirty');
    await addWorktree(repo.path, { path, branch: 'dirty', createBranch: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(path, 'scratch.txt'), 'unsaved work\n', 'utf8');

    const result = await removeWorktree(repo.path, path);

    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'error') throw new Error('expected an error');
    expect(result.message).toMatch(/uncommitted changes/i);
    expect(existsSync(path)).toBe(true);
  });

  it('removes a dirty worktree when force is explicitly requested', async () => {
    const path = join(repo.path, 'wt-forced');
    await addWorktree(repo.path, { path, branch: 'forced', createBranch: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(path, 'scratch.txt'), 'discarded\n', 'utf8');

    expect(await removeWorktree(repo.path, path, true)).toEqual({ ok: true });
    expect(existsSync(path)).toBe(false);
  });

  it('reports a failure for a path that is not a worktree', async () => {
    const result = await removeWorktree(repo.path, join(repo.path, 'nope'));
    expect(result.ok).toBe(false);
  });
});

describe('gitErrorLine', () => {
  it('prefers the fatal line over progress noise', async () => {
    // `git worktree add` prints progress to stderr BEFORE the error, so taking
    // the first non-empty line reports the progress note as the failure.
    const { gitErrorLine } = await import('./worktree-ops');
    expect(
      gitErrorLine("Preparing worktree (checking out 'main')\nfatal: 'main' is already used\n"),
    ).toBe("'main' is already used");
  });

  it('falls back to the first line when nothing is marked fatal', async () => {
    const { gitErrorLine } = await import('./worktree-ops');
    expect(gitErrorLine('something odd happened\nand then more\n')).toBe('something odd happened');
  });

  it('returns empty for empty stderr', async () => {
    const { gitErrorLine } = await import('./worktree-ops');
    expect(gitErrorLine('')).toBe('');
  });
});
