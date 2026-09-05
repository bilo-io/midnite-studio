import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RepoDescriptor, Worktree } from '@midnite/studio-shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { listRepos, worktreesFor } from '../repo-registry';
import {
  classify,
  cleanItems,
  MAX_WALK_DEPTH,
  scanWorkspace,
  staleWorktreeCandidates,
} from './scan-service';

vi.mock('../repo-registry', () => ({
  listRepos: vi.fn(),
  worktreesFor: vi.fn(),
}));

const worktree = (overrides: Partial<Worktree>): Worktree => ({
  id: 'wt',
  repoId: 'repo',
  path: '/tmp/x',
  branch: null,
  headSha: 'deadbeef',
  locked: false,
  isMain: false,
  prunable: false,
  ...overrides,
});

describe('classify', () => {
  it('matches each seeded pattern', () => {
    expect(classify('/a/b/node_modules')).toBe('nodeModules');
    expect(classify('/a/b/dist')).toBe('buildOutput');
    expect(classify('/a/b/.moon')).toBe('buildOutput');
  });

  it('returns null for anything unmatched', () => {
    expect(classify('/a/b/src')).toBeNull();
  });

  it('honors an injected pattern list over the default', () => {
    expect(classify('/a/build', [{ basename: 'build', category: 'buildOutput' }])).toBe(
      'buildOutput',
    );
    expect(classify('/a/node_modules', [{ basename: 'build', category: 'buildOutput' }])).toBeNull();
  });
});

describe('staleWorktreeCandidates', () => {
  it('a detached HEAD worktree is never a candidate, even if its "branch" were somehow set', async () => {
    const repo: RepoDescriptor = {
      id: 'repo',
      path: '/tmp/repo',
      name: 'repo',
      headRef: null, // brand-new repo with no commits — no default branch to merge against
      worktrees: [],
    };
    const result = await staleWorktreeCandidates(repo, [
      worktree({ path: '/tmp/repo-wt', branch: null, isMain: false }),
    ]);
    expect(result.size).toBe(0);
  });

  it('the main worktree is never a candidate regardless of merge state', async () => {
    const repo: RepoDescriptor = {
      id: 'repo',
      path: '/tmp/repo',
      name: 'repo',
      headRef: null,
      worktrees: [],
    };
    const result = await staleWorktreeCandidates(repo, [
      worktree({ path: '/tmp/repo', branch: 'main', isMain: true }),
    ]);
    expect(result.size).toBe(0);
  });
});

describe('scanWorkspace (fixture-tree walk)', () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-scan-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-scan-outside-')));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockSingleRepo(repoPath: string): void {
    vi.mocked(listRepos).mockResolvedValue([
      { id: 'repo', path: repoPath, name: 'repo', headRef: null, worktrees: [] },
    ]);
    vi.mocked(worktreesFor).mockResolvedValue([
      worktree({ path: repoPath, branch: 'main', isMain: true }),
    ]);
  }

  it('finds node_modules and dist, sizes them, and does not descend into them', async () => {
    const repoPath = join(root, 'repo-a');
    await mkdir(join(repoPath, 'node_modules', 'left-pad'), { recursive: true });
    await writeFile(join(repoPath, 'node_modules', 'left-pad', 'index.js'), 'x'.repeat(10));
    await mkdir(join(repoPath, 'dist'), { recursive: true });
    await writeFile(join(repoPath, 'dist', 'bundle.js'), 'y'.repeat(20));
    await mkdir(join(repoPath, 'src'), { recursive: true });
    await writeFile(join(repoPath, 'src', 'index.ts'), 'z'.repeat(5));

    mockSingleRepo(repoPath);

    const result = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    expect(result.byCategory.nodeModules).toBe(10);
    expect(result.byCategory.buildOutput).toBe(20);
    expect(result.items.map((i) => i.category).sort()).toEqual(['buildOutput', 'nodeModules']);
  });

  it('refuses to traverse a symlinked directory, at any depth', async () => {
    const repoPath = join(root, 'repo-symlink');
    await mkdir(repoPath, { recursive: true });
    await mkdir(join(outside, 'escaped-node_modules'), { recursive: true });
    await writeFile(join(outside, 'escaped-node_modules', 'big.bin'), 'w'.repeat(1000));
    await symlink(join(outside, 'escaped-node_modules'), join(repoPath, 'node_modules'));

    mockSingleRepo(repoPath);

    const result = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    // The symlink named `node_modules` is never followed, so nothing outside
    // `repoPath` is sized — not even the entry itself, since it's a symlink.
    expect(result.totalBytes).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('bounds the walk at MAX_WALK_DEPTH — a marker past the bound is never found', async () => {
    const repoPath = join(root, 'repo-deep');
    let dir = repoPath;
    for (let i = 0; i < MAX_WALK_DEPTH + 3; i += 1) {
      dir = join(dir, `level-${i}`);
    }
    await mkdir(join(dir, 'node_modules'), { recursive: true });
    await writeFile(join(dir, 'node_modules', 'marker.txt'), 'deep');

    mockSingleRepo(repoPath);

    const result = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    expect(result.items).toHaveLength(0);
  });

  it('aborting mid-walk returns a valid, non-throwing partial result', async () => {
    const repoPath = join(root, 'repo-abort');
    await mkdir(join(repoPath, 'a', 'node_modules'), { recursive: true });
    await mkdir(join(repoPath, 'b', 'node_modules'), { recursive: true });
    await writeFile(join(repoPath, 'a', 'node_modules', 'f.js'), 'a'.repeat(50));
    await writeFile(join(repoPath, 'b', 'node_modules', 'f.js'), 'b'.repeat(50));

    mockSingleRepo(repoPath);

    const controller = new AbortController();
    controller.abort();

    await expect(
      scanWorkspace({ signal: controller.signal, onProgress: () => {} }),
    ).resolves.toEqual({
      totalBytes: 0,
      byCategory: { nodeModules: 0, buildOutput: 0, staleWorktree: 0, looseObjects: 0 },
      items: [],
      truncated: false,
    });
  });
});

describe('cleanItems (delete-time re-validation)', () => {
  let root: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-clean-')));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('skips a path that vanished since the scan, reporting it rather than throwing', async () => {
    const trash = vi.fn(async () => {});
    const result = await cleanItems([join(root, 'gone')], [root], trash);
    expect(result.freedBytes).toBe(0);
    expect(result.skipped).toEqual([{ path: join(root, 'gone'), reason: 'no longer exists' }]);
    expect(trash).not.toHaveBeenCalled();
  });

  it('skips a path that is now a symlink', async () => {
    const target = join(root, 'real-dir');
    await mkdir(target, { recursive: true });
    const link = join(root, 'link-dir');
    await symlink(target, link);

    const trash = vi.fn(async () => {});
    const result = await cleanItems([link], [root], trash);
    expect(result.skipped).toEqual([{ path: link, reason: 'is now a symlink' }]);
    expect(trash).not.toHaveBeenCalled();
  });

  it('trashes a real, still-confined item and reports its bytes freed', async () => {
    const target = join(root, 'node_modules');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'f.js'), 'x'.repeat(1234));

    const trash = vi.fn(async () => {});
    const result = await cleanItems([target], [root], trash);
    expect(result.freedBytes).toBe(1234);
    expect(result.skipped).toEqual([]);
    expect(trash).toHaveBeenCalledWith(target);
  });
});
