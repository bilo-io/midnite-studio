import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execGit } from '@midnite/studio-git-engine';
import type { RepoDescriptor, Worktree } from '@midnite/studio-shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ArtifactDetector } from './detectors';
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

vi.mock('@midnite/studio-git-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@midnite/studio-git-engine')>();
  return { ...actual, execGit: vi.fn() };
});

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
  it('matches node_modules and dist against the default catalogue', async () => {
    expect((await classify('/a/b/node_modules', new Set()))?.id).toBe('node-modules');
    expect(
      (await classify('/a/b/dist', new Set(['package.json'])))?.id,
    ).toBe('node-dist');
  });

  it('returns null for anything unmatched', async () => {
    expect(await classify('/a/b/src', new Set())).toBeNull();
  });

  it('honors an injected detector list over the default', async () => {
    const buildDetector: ArtifactDetector = {
      id: 'test-build',
      label: 'build/',
      category: 'buildOutput',
      ecosystem: 'multi',
      producer: 'test',
      match: ['build'],
      evidence: { kind: 'none' },
      reclaim: 'cheap',
    };
    expect((await classify('/a/build', new Set(), [buildDetector]))?.id).toBe('test-build');
    expect(await classify('/a/node_modules', new Set(), [buildDetector])).toBeNull();
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

  /** Two independent repo roots, each resolved by its own id — for the
   *  per-root budget test, which needs `collectRoots()` to walk them in a
   *  known order rather than as two worktrees of one repo. */
  function mockRepos(entries: readonly { id: string; path: string }[]): void {
    vi.mocked(listRepos).mockResolvedValue(
      entries.map(({ id, path }) => ({ id, path, name: id, headRef: null, worktrees: [] })),
    );
    vi.mocked(worktreesFor).mockImplementation(async (repoId: string) => {
      const entry = entries.find((e) => e.id === repoId);
      return entry ? [worktree({ path: entry.path, branch: 'main', isMain: true })] : [];
    });
  }

  it('finds node_modules and dist, sizes them, and does not descend into them', async () => {
    const repoPath = join(root, 'repo-a');
    await mkdir(join(repoPath, 'node_modules', 'left-pad'), { recursive: true });
    await writeFile(join(repoPath, 'node_modules', 'left-pad', 'index.js'), 'x'.repeat(10));
    await writeFile(join(repoPath, 'package.json'), '{}'); // node-dist's sibling evidence
    await mkdir(join(repoPath, 'dist'), { recursive: true });
    await writeFile(join(repoPath, 'dist', 'bundle.js'), 'y'.repeat(20));
    await mkdir(join(repoPath, 'src'), { recursive: true });
    await writeFile(join(repoPath, 'src', 'index.ts'), 'z'.repeat(5));

    mockSingleRepo(repoPath);

    const result = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    expect(result.byCategory.dependencies).toBe(10);
    expect(result.byCategory.buildOutput).toBe(20);
    expect(result.byEcosystem.node).toBe(30);
    expect(result.items.map((i) => i.category).sort()).toEqual(['buildOutput', 'dependencies']);

    const nodeModulesItem = result.items.find((i) => i.detectorId === 'node-modules');
    expect(nodeModulesItem).toMatchObject({ ecosystem: 'node', reclaim: 'costly' });
    expect(result.detectors['node-modules']).toEqual({
      label: 'node_modules',
      producer: 'npm/pnpm/yarn install',
    });

    const distItem = result.items.find((i) => i.detectorId === 'node-dist');
    expect(distItem).toMatchObject({ ecosystem: 'node', reclaim: 'cheap' });
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

  it('a detector never matches inside .git, even when a fixture plants one there', async () => {
    const repoPath = join(root, 'repo-git-guard');
    await mkdir(join(repoPath, '.git', 'node_modules'), { recursive: true });
    await writeFile(join(repoPath, '.git', 'node_modules', 'x.js'), 'x'.repeat(50));

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
      byCategory: { dependencies: 0, buildOutput: 0, toolCache: 0, staleWorktree: 0, looseObjects: 0 },
      byEcosystem: {
        node: 0,
        multi: 0,
        rust: 0,
        cpp: 0,
        dotnet: 0,
        python: 0,
        java: 0,
        swift: 0,
        ruby: 0,
        go: 0,
        media: 0,
        git: 0,
      },
      detectors: {},
      items: [],
      truncated: false,
      truncatedRoots: [],
    });
  });

  it('the two ambiguous-name cases: target/ resolves by evidence, Rust winning when both apply', async () => {
    const rustOnly = join(root, 'ambiguous-rust');
    await mkdir(join(rustOnly, 'target'), { recursive: true });
    await writeFile(join(rustOnly, 'Cargo.toml'), '[package]');

    mockSingleRepo(rustOnly);
    let result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
    expect(result.items.map((i) => i.detectorId)).toEqual(['rust-target']);

    const mavenOnly = join(root, 'ambiguous-maven');
    await mkdir(join(mavenOnly, 'target'), { recursive: true });
    await writeFile(join(mavenOnly, 'pom.xml'), '<project/>');

    mockSingleRepo(mavenOnly);
    result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
    expect(result.items.map((i) => i.detectorId)).toEqual(['maven-target']);

    const both = join(root, 'ambiguous-both');
    await mkdir(join(both, 'target'), { recursive: true });
    await writeFile(join(both, 'Cargo.toml'), '[package]');
    await writeFile(join(both, 'pom.xml'), '<project/>');

    mockSingleRepo(both);
    result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
    expect(result.items.map((i) => i.detectorId)).toEqual(['rust-target']);
  });

  describe('a positive fixture per catalogued ecosystem', () => {
    it('CMake (cpp): build/ with CMakeCache.txt inside it', async () => {
      const repoPath = join(root, 'eco-cmake');
      await mkdir(join(repoPath, 'build'), { recursive: true });
      await writeFile(join(repoPath, 'build', 'CMakeCache.txt'), 'x');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toMatchObject([
        { detectorId: 'cmake-build', ecosystem: 'cpp', category: 'buildOutput', reclaim: 'cheap' },
      ]);
    });

    it('.NET (dotnet): obj/ beside a .csproj', async () => {
      const repoPath = join(root, 'eco-dotnet');
      await mkdir(join(repoPath, 'obj'), { recursive: true });
      await writeFile(join(repoPath, 'App.csproj'), '<Project/>');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toMatchObject([
        { detectorId: 'dotnet-obj', ecosystem: 'dotnet', category: 'buildOutput', reclaim: 'cheap' },
      ]);
    });

    it('Python tool cache: __pycache__ needs no evidence', async () => {
      const repoPath = join(root, 'eco-pycache');
      await mkdir(join(repoPath, '__pycache__'), { recursive: true });

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toMatchObject([
        { detectorId: 'py-pycache', ecosystem: 'python', category: 'toolCache', reclaim: 'cheap' },
      ]);
    });

    it('Python venv: matched only with pyvenv.cfg inside it', async () => {
      const repoPath = join(root, 'eco-venv');
      await mkdir(join(repoPath, 'venv'), { recursive: true });
      await writeFile(join(repoPath, 'venv', 'pyvenv.cfg'), 'home = /usr/bin');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toMatchObject([
        { detectorId: 'py-venv', ecosystem: 'python', category: 'dependencies', reclaim: 'costly' },
      ]);
    });

    it('Java (Gradle): build/ beside build.gradle', async () => {
      const repoPath = join(root, 'eco-gradle');
      await mkdir(join(repoPath, 'build'), { recursive: true });
      await writeFile(join(repoPath, 'build.gradle'), '');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toMatchObject([
        { detectorId: 'gradle-build', ecosystem: 'java', category: 'buildOutput', reclaim: 'cheap' },
      ]);
    });

    it('Swift/Xcode: Pods/ beside a Podfile', async () => {
      const repoPath = join(root, 'eco-cocoapods');
      await mkdir(join(repoPath, 'Pods'), { recursive: true });
      await writeFile(join(repoPath, 'Podfile'), '');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toMatchObject([
        { detectorId: 'cocoapods-pods', ecosystem: 'swift', category: 'dependencies', reclaim: 'costly' },
      ]);
    });

    it('Ruby: vendor/bundle/ with a "ruby" entry inside it', async () => {
      const repoPath = join(root, 'eco-ruby');
      await mkdir(join(repoPath, 'vendor', 'bundle', 'ruby'), { recursive: true });

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toMatchObject([
        { detectorId: 'ruby-vendor-bundle', ecosystem: 'ruby', category: 'dependencies', reclaim: 'costly' },
      ]);
    });

    it('moon: .moon/cache is matched, but .moon/workspace.yml (checked-in config) is not', async () => {
      const repoPath = join(root, 'eco-moon');
      await mkdir(join(repoPath, '.moon', 'cache'), { recursive: true });
      await writeFile(join(repoPath, '.moon', 'workspace.yml'), 'projects: {}');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toMatchObject([
        { detectorId: 'moon-cache', ecosystem: 'multi', category: 'toolCache', reclaim: 'cheap' },
      ]);
    });
  });

  describe('the negative-match fixture set — the half that matters', () => {
    it('bin/ beside a package.json is never offered (no .csproj sibling)', async () => {
      const repoPath = join(root, 'neg-bin');
      await mkdir(join(repoPath, 'bin'), { recursive: true });
      await writeFile(join(repoPath, 'bin', 'run.sh'), '#!/bin/sh');
      await writeFile(join(repoPath, 'package.json'), '{}');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toEqual([]);
      expect(result.totalBytes).toBe(0);
    });

    it('build/ with no CMakeCache.txt and no build.gradle is never offered', async () => {
      const repoPath = join(root, 'neg-build');
      await mkdir(join(repoPath, 'build'), { recursive: true });
      await writeFile(join(repoPath, 'build', 'notes.txt'), 'hand-written');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toEqual([]);
      expect(result.totalBytes).toBe(0);
    });

    it('venv/ with no pyvenv.cfg is never offered', async () => {
      const repoPath = join(root, 'neg-venv');
      await mkdir(join(repoPath, 'venv'), { recursive: true });
      await writeFile(join(repoPath, 'venv', 'notes.txt'), 'hand-written');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toEqual([]);
      expect(result.totalBytes).toBe(0);
    });

    it('vendor/bundle/ with no "ruby" entry inside it is never offered', async () => {
      const repoPath = join(root, 'neg-vendor');
      await mkdir(join(repoPath, 'vendor', 'bundle'), { recursive: true });
      await writeFile(join(repoPath, 'vendor', 'bundle', 'README.md'), 'checked in');
      await writeFile(join(repoPath, 'Gemfile'), '');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toEqual([]);
      expect(result.totalBytes).toBe(0);
    });

    it('.moon/ containing only checked-in configuration is never offered', async () => {
      const repoPath = join(root, 'neg-moon');
      await mkdir(join(repoPath, '.moon'), { recursive: true });
      await writeFile(join(repoPath, '.moon', 'workspace.yml'), 'projects: {}');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toEqual([]);
      expect(result.totalBytes).toBe(0);
    });

    it('target/ with no Cargo.toml and no pom.xml is never offered', async () => {
      const repoPath = join(root, 'neg-target');
      await mkdir(join(repoPath, 'target'), { recursive: true });
      await writeFile(join(repoPath, 'target', 'notes.txt'), 'hand-written');

      mockSingleRepo(repoPath);
      const result = await scanWorkspace({ signal: new AbortController().signal, onProgress: () => {} });
      expect(result.items).toEqual([]);
      expect(result.totalBytes).toBe(0);
    });
  });

  it('scanWorkspace({ detectors: [oneDetector] }) produces items only for that detector', async () => {
    const repoPath = join(root, 'injected-catalogue');
    await mkdir(join(repoPath, 'node_modules'), { recursive: true });
    await writeFile(join(repoPath, 'node_modules', 'f.js'), 'x'.repeat(10));
    await mkdir(join(repoPath, 'dist'), { recursive: true });
    await writeFile(join(repoPath, 'package.json'), '{}');
    await writeFile(join(repoPath, 'dist', 'bundle.js'), 'y'.repeat(20));

    mockSingleRepo(repoPath);

    const distOnly: ArtifactDetector = {
      id: 'node-dist',
      label: 'dist/',
      category: 'buildOutput',
      ecosystem: 'node',
      producer: 'npm run build',
      match: ['dist'],
      evidence: { kind: 'siblingAny', names: ['package.json'] },
      reclaim: 'cheap',
    };

    const result = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
      detectors: [distOnly],
    });

    expect(result.items.map((i) => i.detectorId)).toEqual(['node-dist']);
  });

  it('the stale-worktree item carries its synthesised detector identity', async () => {
    const repoPath = join(root, 'stale-main');
    const stalePath = join(root, 'stale-wt');
    await mkdir(repoPath, { recursive: true });
    await mkdir(stalePath, { recursive: true });
    await writeFile(join(stalePath, 'marker.txt'), 'x'.repeat(7));

    vi.mocked(listRepos).mockResolvedValue([
      { id: 'repo', path: repoPath, name: 'repo', headRef: 'main', worktrees: [] },
    ]);
    vi.mocked(worktreesFor).mockResolvedValue([
      worktree({ path: repoPath, branch: 'main', isMain: true }),
      worktree({ path: stalePath, branch: 'feature/gone', isMain: false }),
    ]);
    vi.mocked(execGit).mockResolvedValue({
      exitCode: 0,
      stdout: 'feature/gone\n',
      stderr: '',
      args: [],
    });

    const result = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    const staleItem = result.items.find((i) => i.category === 'staleWorktree');
    expect(staleItem).toMatchObject({
      detectorId: 'git-stale-worktree',
      ecosystem: 'git',
      reclaim: 'cheap',
    });
    expect(result.byEcosystem.git).toBe(staleItem?.bytes ?? -1);
    expect(result.detectors['git-stale-worktree']).toEqual({
      label: 'Stale worktree',
      producer: 'git worktree add',
    });
  });

  it('MAX_ENTRIES_PER_ROOT: a root that exhausts its own budget does not starve the next one', async () => {
    const heavyRoot = join(root, 'budget-heavy');
    // Ten plain, unmatched subdirectories — enough entries to trip a
    // deliberately low injected `perRootLimit` well before this root's own
    // walk would otherwise finish.
    for (let i = 0; i < 10; i += 1) {
      await mkdir(join(heavyRoot, `d${i}`), { recursive: true });
    }

    const lightRoot = join(root, 'budget-light');
    await mkdir(join(lightRoot, 'node_modules'), { recursive: true });
    await writeFile(join(lightRoot, 'node_modules', 'f.js'), 'x'.repeat(10));

    mockRepos([
      { id: 'heavy', path: heavyRoot },
      { id: 'light', path: lightRoot },
    ]);

    const result = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
      perRootLimit: 3,
    });

    // The second root still yields its item...
    expect(result.items.map((i) => i.detectorId)).toEqual(['node-modules']);
    // ...and only the FIRST root is named as truncated — pushed once, not twice.
    expect(result.truncatedRoots).toEqual([heavyRoot]);
    expect(result.truncated).toBe(true);
  });

  it('disabledEcosystems excludes a whole ecosystem from the catalogue', async () => {
    const repoPath = join(root, 'disabled-ecosystem');
    await mkdir(join(repoPath, '.venv'), { recursive: true });
    await writeFile(join(repoPath, '.venv', 'pyvenv.cfg'), 'home = /usr/bin');
    await mkdir(join(repoPath, 'node_modules'), { recursive: true });
    await writeFile(join(repoPath, 'node_modules', 'f.js'), 'x'.repeat(10));

    mockSingleRepo(repoPath);

    const withoutPython = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
      disabledEcosystems: ['python'],
    });
    expect(withoutPython.items.map((i) => i.ecosystem).sort()).toEqual(['node']);

    const everything = await scanWorkspace({
      signal: new AbortController().signal,
      onProgress: () => {},
      disabledEcosystems: [],
    });
    expect(everything.items.map((i) => i.ecosystem).sort()).toEqual(['node', 'python']);
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
