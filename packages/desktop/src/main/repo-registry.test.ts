import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execGit } from '@midnite/studio-git-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeRepo,
  configureRegistry,
  listRepos,
  openRepo,
  resetRegistry,
  resolveWorkdir,
  worktreesFor,
} from './repo-registry';
import { createRepoStore } from './repo-store';

/**
 * The registry against real repositories. It carries no `electron` import
 * precisely so this can run under plain vitest — the persistence directory is
 * injected, and everything else is git.
 */

let scratch: string;
let repoPath: string;

const git = async (cwd: string, args: string[]): Promise<void> => {
  const res = await execGit(cwd, args, { write: true });
  if (res.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
};

beforeEach(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-registry-')));
  repoPath = join(scratch, 'project');

  await git(scratch, ['init', '--initial-branch=main', repoPath]);
  await git(repoPath, ['config', 'user.name', 'Test']);
  await git(repoPath, ['config', 'user.email', 'test@example.com']);
  await git(repoPath, ['config', 'commit.gpgsign', 'false']);
  await git(repoPath, ['commit', '--allow-empty', '-m', 'base']);

  configureRegistry(createRepoStore(scratch));
});

afterEach(async () => {
  resetRegistry();
  await rm(scratch, { recursive: true, force: true });
});

describe('openRepo', () => {
  it('opens a repository by its root', async () => {
    const result = await openRepo(repoPath);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repo).toMatchObject({ path: repoPath, name: 'project', headRef: 'main' });
  });

  it('opens a repository from a subdirectory', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(repoPath, 'src', 'deep'), { recursive: true });

    const result = await openRepo(join(repoPath, 'src', 'deep'));
    expect(result.ok && result.repo.path).toBe(repoPath);
  });

  it('nests a linked worktree under its owning repo instead of adding a sibling', async () => {
    // The defining behaviour of the panel. In a linked worktree `.git` is a
    // FILE, so anything probing for a `.git` directory sees a separate repo and
    // the sidebar grows a duplicate whose worktree list is identical.
    const linked = join(scratch, 'wt-feature');
    await git(repoPath, ['worktree', 'add', '-b', 'feature', linked]);

    await openRepo(repoPath);
    await openRepo(linked);

    const repos = await listRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]?.path).toBe(repoPath);
    expect(repos[0]?.worktrees.map((w) => w.path)).toEqual([repoPath, linked]);
  });

  it('opening the same repo twice does not duplicate it', async () => {
    await openRepo(repoPath);
    await openRepo(repoPath);
    expect(await listRepos()).toHaveLength(1);
  });

  it('rejects a directory that is not a repository', async () => {
    const result = await openRepo(scratch);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/not a git repository/i);
  });
});

describe('persistence', () => {
  it('restores the open list into a fresh registry', async () => {
    await openRepo(repoPath);

    // Simulate a relaunch: same store directory, empty in-memory registry.
    resetRegistry();
    configureRegistry(createRepoStore(scratch));
    const { restoreRepos } = await import('./repo-registry');
    await restoreRepos();

    expect((await listRepos()).map((r) => r.path)).toEqual([repoPath]);
  });

  it('drops a repo whose directory vanished between sessions', async () => {
    // An entry the user cannot act on is worse than no entry.
    const doomed = join(scratch, 'doomed');
    await git(scratch, ['init', doomed]);
    await openRepo(doomed);
    await rm(doomed, { recursive: true, force: true });

    resetRegistry();
    configureRegistry(createRepoStore(scratch));
    const { restoreRepos } = await import('./repo-registry');
    await restoreRepos();

    expect(await listRepos()).toEqual([]);
  });

  it('forgets a closed repo', async () => {
    const opened = await openRepo(repoPath);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    await closeRepo(opened.repo.id);
    expect(await listRepos()).toEqual([]);
  });
});

describe('resolveWorkdir', () => {
  it('defaults to the main worktree', async () => {
    const opened = await openRepo(repoPath);
    if (!opened.ok) throw new Error('open failed');

    expect(await resolveWorkdir(opened.repo.id)).toBe(repoPath);
  });

  it('honours a real linked worktree', async () => {
    const linked = join(scratch, 'wt-x');
    await git(repoPath, ['worktree', 'add', '-b', 'x', linked]);
    const opened = await openRepo(repoPath);
    if (!opened.ok) throw new Error('open failed');

    expect(await resolveWorkdir(opened.repo.id, linked)).toBe(linked);
  });

  it('returns null for a path that is not one of the repo\'s worktrees', async () => {
    // The value arrives from the renderer; honouring it unchecked would run git
    // writes in an arbitrary directory. Falling back to the main worktree would
    // silently run the call there and hand back its data mislabeled as the
    // requested worktree's — null lets callers report "gone" instead.
    const opened = await openRepo(repoPath);
    if (!opened.ok) throw new Error('open failed');

    expect(await resolveWorkdir(opened.repo.id, '/etc')).toBeNull();
  });

  it('returns null for a worktree that has since been removed', async () => {
    const linked = join(scratch, 'wt-removed');
    await git(repoPath, ['worktree', 'add', '-b', 'removed', linked]);
    const opened = await openRepo(repoPath);
    if (!opened.ok) throw new Error('open failed');
    expect(await resolveWorkdir(opened.repo.id, linked)).toBe(linked);

    await git(repoPath, ['worktree', 'remove', linked]);
    expect(await resolveWorkdir(opened.repo.id, linked)).toBeNull();
  });

  it('returns null for an unknown repo', async () => {
    expect(await resolveWorkdir('repo:/nope')).toBeNull();
  });
});

describe('worktreesFor', () => {
  it('returns an empty list for an unknown repo rather than throwing', async () => {
    // The renderer can hold a stale id for a frame after a close; an empty list
    // renders as "nothing here", an exception renders as an error boundary.
    expect(await worktreesFor('repo:/gone')).toEqual([]);
  });
});
