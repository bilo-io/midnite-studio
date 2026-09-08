import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { COMPANION_DEFAULT_DIGEST_WINDOW_MS } from '@midnite/studio-shared';
import type { Commit, GraphRow, Ref, RepoDescriptor } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { McpDispatchResult } from '../mcp/dispatch';
import { createCompanionStore, nullCompanionStore } from './companion-store';
import {
  buildCompanionDigest,
  DIGEST_LOG_LIMIT,
  readTrackerFile,
  type CompanionDigestDeps,
} from './digest';

const NOW = Date.parse('2026-09-08T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  dirs = [];
});

/**
 * A real directory on disk with real tracker files — the fixture repo the
 * phase doc asks for. The git and forge halves are faked (a temp directory is
 * not a checkout), but the tracker half goes through the production
 * `readTrackerFile`, so `confineToRoot` is genuinely exercised.
 */
async function fixtureRepo(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ms-digest-'));
  dirs.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(dir, relPath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return dir;
}

const DONE_MD = [
  '# Done — append-only log',
  '',
  '## 2026-09-07 — Phase 26 Themes C, H',
  '',
  'Body prose.',
  '',
  '## 2026-08-01 — Phase 12 Theme A',
  '',
  'Older than the window.',
  '',
].join('\n');

const INDEX_MD = [
  '| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |',
  '|-------|--------|---------|------|----------|---|--------|--------|',
  '| [79 · The companion](phases/phase-79-x.md) | 🔄 WIP | — | 0/67 | `░░░░░░░░░░` | 0% | A B | C D |',
  '| [78 · Whose hands](phases/phase-78-x.md) | ◻ TODO | — | 0/32 | `░░░░░░░░░░` | 0% | — | A |',
  '',
].join('\n');

const commit = (over: Partial<Commit> & Pick<Commit, 'sha'>): Commit => ({
  parents: [],
  authorName: 'Bilo',
  authorEmail: 'b@example.test',
  authorDate: Math.floor(NOW / 1000),
  committerDate: Math.floor(NOW / 1000),
  subject: 'a commit',
  refs: [],
  ...over,
});

const row = (c: Commit, index: number): GraphRow => ({
  row: index,
  commit: c,
  lane: 0,
  colorIdx: 0,
  edges: [],
  laneCount: 1,
});

const ref = (over: Partial<Ref> & Pick<Ref, 'name' | 'kind'>): Ref => ({
  fullName: over.kind === 'remoteBranch' ? `refs/remotes/${over.name}` : `refs/heads/${over.name}`,
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const ok = (value: unknown): McpDispatchResult => ({ ok: true, value });
const fail = (): McpDispatchResult => ({ ok: false, kind: 'error', message: 'nope' });

const readyPulls = (pulls: unknown[]): unknown => ({
  cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
  pulls,
  error: null,
});

const pull = (over: Record<string, unknown>): unknown => ({
  id: 'gid',
  number: 1,
  title: 'a pull request',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/x',
  author: 'bilo-io',
  url: 'https://example.test',
  mergedAt: null,
  closedAt: null,
  ...over,
});

function depsFor(
  repoRoot: string,
  table: Record<string, (input: unknown) => Promise<McpDispatchResult>>,
  over: Partial<CompanionDigestDeps> = {},
): CompanionDigestDeps {
  const descriptor: RepoDescriptor = {
    id: 'r1',
    path: repoRoot,
    name: 'fixture',
    headRef: 'main',
    worktrees: [],
  };
  return {
    dispatch: vi.fn(async (tool: string, input: unknown) =>
      (
        table[tool] ??
        (async () => (tool === 'repo.resolve' ? ok({ repo: descriptor, branch: 'main' }) : fail()))
      )(input),
    ),
    store: nullCompanionStore,
    readTracker: readTrackerFile,
    now: () => NOW,
    ...over,
  };
}

describe('buildCompanionDigest', () => {
  it('splits landed from in-progress on a fixture repo', async () => {
    const repoRoot = await fixtureRepo({
      '.midnite/tasks/done.md': DONE_MD,
      '.midnite/tasks/_INDEX.md': INDEX_MD,
    });

    const tip = commit({
      sha: 'a'.repeat(40),
      subject: 'feat: the newest thing',
      refs: ['refs/heads/main', 'refs/remotes/origin/main'],
      parents: ['b'.repeat(40)],
      committerDate: Math.floor((NOW - DAY) / 1000),
    });
    const parent = commit({
      sha: 'b'.repeat(40),
      subject: 'fix: the older thing',
      committerDate: Math.floor((NOW - 2 * DAY) / 1000),
    });
    const ancient = commit({
      sha: 'c'.repeat(40),
      subject: 'chore: before the window',
      committerDate: Math.floor((NOW - 60 * DAY) / 1000),
    });

    const digest = await buildCompanionDigest(
      { repoPath: repoRoot },
      depsFor(repoRoot, {
        'graph.log': async () => ok([tip, parent, ancient].map(row)),
        'branch.list': async () =>
          ok([
            ref({ name: 'origin/main', kind: 'remoteBranch' }),
            ref({ name: 'main', kind: 'localBranch' }),
            ref({
              name: 'feature/x',
              kind: 'localBranch',
              upstream: { name: 'origin/feature/x', ahead: 2, behind: 0, gone: false },
            }),
            ref({
              name: 'feature/pushed',
              kind: 'localBranch',
              upstream: { name: 'origin/feature/pushed', ahead: 0, behind: 0, gone: false },
            }),
          ]),
        'forge.pulls': async (input) =>
          ok(
            (input as { state?: string }).state === 'merged'
              ? readyPulls([
                  pull({
                    number: 267,
                    title: 'split width fallback',
                    state: 'merged',
                    mergedAt: new Date(NOW - DAY).toISOString(),
                  }),
                  pull({
                    number: 100,
                    title: 'ancient history',
                    state: 'merged',
                    mergedAt: new Date(NOW - 90 * DAY).toISOString(),
                  }),
                ])
              : readyPulls([pull({ number: 268, title: 'phases 76-78' })]),
          ),
      }),
    );

    // Window: seven days, since the null store has no mark.
    expect(digest.since).toBe(NOW - COMPANION_DEFAULT_DIGEST_WINDOW_MS);

    const landed = digest.landed.map((item) => `${item.kind}:${item.title}`);
    expect(landed).toContain('commit:feat: the newest thing');
    expect(landed).toContain('commit:fix: the older thing');
    expect(landed).toContain('pr:split width fallback');
    expect(landed).toContain('phase:Phase 26 Themes C, H');
    // Everything older than the window is gone from all three sources.
    expect(landed).not.toContain('commit:chore: before the window');
    expect(landed).not.toContain('pr:ancient history');
    expect(landed).not.toContain('phase:Phase 12 Theme A');

    // Landed is newest-first.
    expect(digest.landed.map((item) => item.at)).toEqual(
      [...digest.landed.map((item) => item.at)].sort((a, b) => b - a),
    );

    const inProgress = digest.inProgress.map((item) => `${item.kind}:${item.title}`);
    expect(inProgress).toContain('pr:phases 76-78');
    expect(inProgress).toContain('commit:feature/x (2 unpushed)');
    expect(inProgress).toContain('phase:Phase 79 A, B — The companion');
    // A fully-pushed branch is represented by its PR, not twice.
    expect(inProgress.join(' ')).not.toContain('feature/pushed');
    // A `◻ TODO` row is not in progress.
    expect(inProgress.join(' ')).not.toContain('Phase 78');
    // The default branch is never its own in-progress row.
    expect(inProgress.join(' ')).not.toContain('commit:main');
  });

  it('walks first-parent from the tip and stops at the window', async () => {
    const repoRoot = await fixtureRepo();
    const tip = commit({
      sha: 'a'.repeat(40),
      subject: 'tip',
      refs: ['refs/heads/main'],
      parents: ['b'.repeat(40), 'z'.repeat(40)],
    });
    const firstParent = commit({ sha: 'b'.repeat(40), subject: 'first parent' });
    const secondParent = commit({ sha: 'z'.repeat(40), subject: 'a side branch' });

    const digest = await buildCompanionDigest(
      { repoPath: repoRoot },
      depsFor(repoRoot, {
        'graph.log': async () => ok([tip, firstParent, secondParent].map(row)),
        'branch.list': async () => ok([ref({ name: 'main', kind: 'localBranch' })]),
      }),
    );
    const titles = digest.landed.map((item) => item.title);
    expect(titles).toEqual(['tip', 'first parent']);
    expect(titles).not.toContain('a side branch');
  });

  it('claims nothing landed when no default branch is resolvable', async () => {
    const repoRoot = await fixtureRepo();
    const digest = await buildCompanionDigest(
      { repoPath: repoRoot },
      depsFor(repoRoot, {
        'graph.log': async () => ok([commit({ sha: 'a'.repeat(40), subject: 'x' })].map(row)),
        'branch.list': async () => ok([ref({ name: 'feature/only', kind: 'localBranch' })]),
      }),
    );
    expect(digest.landed).toEqual([]);
  });

  it('claims nothing landed when the default branch has no tip in the log window', async () => {
    const repoRoot = await fixtureRepo();
    const digest = await buildCompanionDigest(
      { repoPath: repoRoot },
      depsFor(repoRoot, {
        'graph.log': async () =>
          ok([commit({ sha: 'a'.repeat(40), subject: 'undecorated' })].map(row)),
        'branch.list': async () => ok([ref({ name: 'main', kind: 'localBranch' })]),
      }),
    );
    expect(digest.landed).toEqual([]);
  });

  it('reads the persisted mark as its window, and only moves it when asked', async () => {
    const repoRoot = await fixtureRepo();
    const dir = await fixtureRepo();
    const store = createCompanionStore(dir);
    await store.markGreeted('r1', NOW - 2 * DAY);

    const deps = depsFor(repoRoot, { 'branch.list': async () => ok([]) }, { store });

    const first = await buildCompanionDigest({ repoPath: repoRoot }, deps);
    expect(first.since).toBe(NOW - 2 * DAY);
    // A plain read must not narrow its own window.
    expect(await store.lastGreeted('r1')).toBe(NOW - 2 * DAY);

    await buildCompanionDigest({ repoPath: repoRoot, mark: true }, deps);
    expect(await store.lastGreeted('r1')).toBe(NOW);
  });

  it('honours an explicit `since` over the persisted mark', async () => {
    const repoRoot = await fixtureRepo();
    const dir = await fixtureRepo();
    const store = createCompanionStore(dir);
    await store.markGreeted('r1', NOW - 30 * DAY);
    const digest = await buildCompanionDigest(
      { repoPath: repoRoot, since: NOW - DAY },
      depsFor(repoRoot, { 'branch.list': async () => ok([]) }, { store }),
    );
    expect(digest.since).toBe(NOW - DAY);
  });

  it('answers an empty digest for a path the registry refuses', async () => {
    const digest = await buildCompanionDigest(
      { repoPath: '/somewhere/else' },
      depsFor('/somewhere/else', {
        'repo.resolve': async () => ({ ok: false, kind: 'refused', message: 'not registered' }),
      }),
    );
    expect(digest).toEqual({ landed: [], inProgress: [], since: NOW });
  });

  it('has no tracker items when the repo has no tracker at all', async () => {
    const repoRoot = await fixtureRepo();
    const digest = await buildCompanionDigest(
      { repoPath: repoRoot },
      depsFor(repoRoot, { 'branch.list': async () => ok([]) }),
    );
    expect(digest.landed.filter((item) => item.kind === 'phase')).toEqual([]);
    expect(digest.inProgress.filter((item) => item.kind === 'phase')).toEqual([]);
  });

  it('refuses a tracker directory that symlinks out of the repository', async () => {
    const outside = await fixtureRepo({ 'tasks/done.md': DONE_MD, 'tasks/_INDEX.md': INDEX_MD });
    const repoRoot = await fixtureRepo();
    await symlink(outside, join(repoRoot, '.midnite'), 'dir');

    const digest = await buildCompanionDigest(
      { repoPath: repoRoot },
      depsFor(repoRoot, { 'branch.list': async () => ok([]) }),
    );
    // `confineToRoot` resolves the symlink and finds it outside the root, so
    // the tracker simply is not there.
    expect(digest.landed.filter((item) => item.kind === 'phase')).toEqual([]);
    expect(digest.inProgress.filter((item) => item.kind === 'phase')).toEqual([]);
  });

  it('ignores an unreachable forge rather than reporting zero PRs', async () => {
    const repoRoot = await fixtureRepo();
    const digest = await buildCompanionDigest(
      { repoPath: repoRoot },
      depsFor(repoRoot, {
        'branch.list': async () => ok([]),
        'forge.pulls': async () => fail(),
      }),
    );
    expect(digest.landed.filter((item) => item.kind === 'pr')).toEqual([]);
    expect(digest.inProgress.filter((item) => item.kind === 'pr')).toEqual([]);
  });

  it('ignores a forge answer from a CLI that is not ready', async () => {
    const repoRoot = await fixtureRepo();
    const digest = await buildCompanionDigest(
      { repoPath: repoRoot },
      depsFor(repoRoot, {
        'branch.list': async () => ok([]),
        'forge.pulls': async () =>
          ok({
            cli: { reason: 'not-installed', binPath: null, hint: 'brew install gh' },
            pulls: [pull({})],
            error: null,
          }),
      }),
    );
    expect(digest.inProgress.filter((item) => item.kind === 'pr')).toEqual([]);
  });

  it('asks graph.log for the limit the tool itself clamps at', async () => {
    const repoRoot = await fixtureRepo();
    const deps = depsFor(repoRoot, { 'branch.list': async () => ok([]) });
    await buildCompanionDigest({ repoPath: repoRoot }, deps);
    const call = (
      deps.dispatch as unknown as { mock: { calls: [string, unknown][] } }
    ).mock.calls.find(([tool]) => tool === 'graph.log');
    expect(call?.[1]).toMatchObject({ limit: DIGEST_LOG_LIMIT });
    expect(DIGEST_LOG_LIMIT).toBe(200);
  });

  it('never rejects, whatever every tool answers', async () => {
    const repoRoot = await fixtureRepo();
    await expect(
      buildCompanionDigest({ repoPath: repoRoot }, depsFor(repoRoot, {})),
    ).resolves.toBeTruthy();
  });
});

describe('readTrackerFile', () => {
  it('reads a file inside the root', async () => {
    const repoRoot = await fixtureRepo({ '.midnite/tasks/done.md': 'hello' });
    expect(await readTrackerFile(repoRoot, '.midnite/tasks/done.md')).toBe('hello');
  });

  it('refuses a traversal out of the root', async () => {
    const repoRoot = await fixtureRepo({ '.midnite/tasks/done.md': 'hello' });
    expect(await readTrackerFile(repoRoot, '../done.md')).toBeNull();
  });

  it('answers null for a missing file', async () => {
    const repoRoot = await fixtureRepo();
    expect(await readTrackerFile(repoRoot, '.midnite/tasks/done.md')).toBeNull();
  });
});
