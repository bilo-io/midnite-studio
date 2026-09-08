import type { RepoDescriptor, StatusResult } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { McpDispatchResult } from '../mcp/dispatch';
import { buildCompanionSnapshot, FORGE_TIMEOUT_MS, type CompanionSnapshotDeps } from './snapshot';

const repo: RepoDescriptor = {
  id: 'r1',
  path: '/repos/studio',
  name: 'studio',
  headRef: 'main',
  worktrees: [],
};

const status = (
  over: Partial<StatusResult['branch']> = {},
  entries: StatusResult['entries'] = [],
): StatusResult => ({
  branch: {
    head: 'main',
    oid: 'a'.repeat(40),
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    unborn: false,
    detached: false,
    ...over,
  },
  entries,
  inProgress: null,
});

const entry = (
  over: Partial<StatusResult['entries'][number]>,
): StatusResult['entries'][number] => ({
  path: 'a.ts',
  origPath: null,
  staged: 'unmodified',
  unstaged: 'unmodified',
  conflicted: false,
  similarity: null,
  ...over,
});

const ok = (value: unknown): McpDispatchResult => ({ ok: true, value });
const fail = (message = 'nope'): McpDispatchResult => ({ ok: false, kind: 'error', message });

const readyPulls = (pulls: unknown[]): unknown => ({
  cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
  pulls,
  error: null,
});

const readyRuns = (runs: unknown[]): unknown => ({
  cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
  runs,
  error: null,
  verdict: null,
});

const run = (conclusion: string | null): unknown => ({
  id: '1',
  name: 'CI',
  status: 'completed',
  conclusion,
  headBranch: 'main',
  headSha: null,
  createdAt: '2026-09-08T00:00:00Z',
  url: 'https://example.test',
});

/** A dispatcher built from a per-tool table; anything unlisted answers `fail()`. */
function dispatcher(table: Record<string, () => Promise<McpDispatchResult>>) {
  return vi.fn(async (tool: string) => (table[tool] ?? (() => Promise.resolve(fail())))());
}

const deps = (
  table: Record<string, () => Promise<McpDispatchResult>>,
  over: Partial<CompanionSnapshotDeps> = {},
): CompanionSnapshotDeps => ({
  dispatch: dispatcher(table),
  sessionCounts: () => ({ live: 0, thinking: 0, waiting: 0 }),
  ...over,
});

describe('buildCompanionSnapshot', () => {
  it('answers the no-repo case with a repo count and nothing else', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: null },
      deps({ 'repo.list': async () => ok([repo, { ...repo, id: 'r2' }]) }),
    );
    expect(snapshot.repo).toBeNull();
    expect(snapshot.repos).toBe(2);
    expect(snapshot.branch).toBeNull();
    expect(snapshot.openPulls).toBeNull();
  });

  it('never calls a repo-scoped tool when no path was given', async () => {
    const dispatch = dispatcher({ 'repo.list': async () => ok([repo]) });
    await buildCompanionSnapshot({ repoPath: null }, deps({}, { dispatch }));
    const tools = dispatch.mock.calls.map(([tool]) => tool);
    expect(tools).toEqual(['repo.list']);
  });

  it('composes branch, ahead/behind and dirty counts from the MCP tools', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: '/repos/studio' },
      deps({
        'repo.list': async () => ok([repo]),
        'repo.resolve': async () => ok({ repo, branch: 'feature/x' }),
        'status.get': async () =>
          ok(
            status({ ahead: 3, behind: 1 }, [
              entry({ staged: 'modified' }),
              entry({ path: 'b.ts', unstaged: 'modified' }),
              entry({ path: 'c.ts', staged: 'added', unstaged: 'modified' }),
              entry({ path: 'd.ts', unstaged: 'untracked' }),
            ]),
          ),
        'forge.pulls': async () => ok(readyPulls([])),
        'forge.checks': async () => ok(readyRuns([])),
      }),
    );

    expect(snapshot.repo).toEqual(repo);
    expect(snapshot.branch).toBe('feature/x');
    expect(snapshot.ahead).toBe(3);
    expect(snapshot.behind).toBe(1);
    // A path staged AND unstaged counts on both sides — the two axes of
    // porcelain v2, so these deliberately do not sum to four files.
    expect(snapshot.dirty).toEqual({ staged: 2, unstaged: 2, untracked: 1 });
  });

  it('carries the live pty counts straight through', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: null },
      deps(
        { 'repo.list': async () => ok([]) },
        { sessionCounts: () => ({ live: 4, thinking: 2, waiting: 1 }) },
      ),
    );
    expect(snapshot.sessions).toEqual({ live: 4, thinking: 2, waiting: 1 });
  });

  it('reports the forge as null when the whole call fails', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: '/repos/studio' },
      deps({
        'repo.list': async () => ok([repo]),
        'repo.resolve': async () => ok({ repo, branch: 'main' }),
        'status.get': async () => ok(status()),
        'forge.pulls': async () => fail('gh exploded'),
        'forge.checks': async () => fail('gh exploded'),
      }),
    );
    expect(snapshot.openPulls).toBeNull();
    expect(snapshot.failingChecks).toBeNull();
    // Everything else still landed — a failing forge does not empty the snapshot.
    expect(snapshot.branch).toBe('main');
  });

  it('reports the forge as null when `gh` is installed but not authenticated', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: '/repos/studio' },
      deps({
        'repo.list': async () => ok([repo]),
        'repo.resolve': async () => ok({ repo, branch: 'main' }),
        'status.get': async () => ok(status()),
        'forge.pulls': async () =>
          ok({
            cli: { reason: 'not-authenticated', binPath: '/usr/bin/gh', hint: 'gh auth login' },
            pulls: [],
            error: null,
          }),
        'forge.checks': async () =>
          ok({
            cli: { reason: 'not-installed', binPath: null, hint: 'brew install gh' },
            runs: [],
            error: null,
            verdict: null,
          }),
      }),
    );
    expect(snapshot.openPulls).toBeNull();
    expect(snapshot.failingChecks).toBeNull();
  });

  it('reports null rather than zero when the listing itself errored behind a ready CLI', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: '/repos/studio' },
      deps({
        'repo.list': async () => ok([repo]),
        'repo.resolve': async () => ok({ repo, branch: 'main' }),
        'status.get': async () => ok(status()),
        'forge.pulls': async () =>
          ok({
            cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
            pulls: [],
            error: 'rate limited',
          }),
        'forge.checks': async () => ok(readyRuns([])),
      }),
    );
    expect(snapshot.openPulls).toBeNull();
    // The other call was fine, and zero here is a claim this code does know.
    expect(snapshot.failingChecks).toBe(0);
  });

  it('counts only the conclusions that mean CI did not pass', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: '/repos/studio' },
      deps({
        'repo.list': async () => ok([repo]),
        'repo.resolve': async () => ok({ repo, branch: 'main' }),
        'status.get': async () => ok(status()),
        'forge.pulls': async () => ok(readyPulls([{}, {}, {}])),
        'forge.checks': async () =>
          ok(
            readyRuns([
              run('failure'),
              run('timed_out'),
              run('startup_failure'),
              run('cancelled'),
              run('skipped'),
              run('success'),
              run('action_required'),
              run(null),
            ]),
          ),
      }),
    );
    expect(snapshot.failingChecks).toBe(3);
    expect(snapshot.openPulls).toBe(3);
  });

  it('caps a hanging forge call and resolves the field null', async () => {
    vi.useFakeTimers();
    try {
      const never = () => new Promise<McpDispatchResult>(() => {});
      const promise = buildCompanionSnapshot(
        { repoPath: '/repos/studio' },
        deps(
          {
            'repo.list': async () => ok([repo]),
            'repo.resolve': async () => ok({ repo, branch: 'main' }),
            'status.get': async () => ok(status({ ahead: 2 })),
            'forge.pulls': never,
            'forge.checks': never,
          },
          { forgeTimeoutMs: 50 },
        ),
      );
      await vi.advanceTimersByTimeAsync(60);
      const snapshot = await promise;
      expect(snapshot.openPulls).toBeNull();
      expect(snapshot.failingChecks).toBeNull();
      expect(snapshot.ahead).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps at three seconds by default, per the phase doc', () => {
    expect(FORGE_TIMEOUT_MS).toBe(3000);
  });

  it('treats a path the registry refuses as "no repo", not an error', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: '/somewhere/else' },
      deps({
        'repo.list': async () => ok([repo]),
        'repo.resolve': async () => ({ ok: false, kind: 'refused', message: 'not registered' }),
      }),
    );
    expect(snapshot.repo).toBeNull();
    expect(snapshot.repos).toBe(1);
  });

  it('falls back to the status branch when `repo.resolve` reports a detached head', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: '/repos/studio' },
      deps({
        'repo.list': async () => ok([repo]),
        'repo.resolve': async () => ok({ repo, branch: null }),
        'status.get': async () => ok(status({ head: 'main' })),
        'forge.pulls': async () => ok(readyPulls([])),
        'forge.checks': async () => ok(readyRuns([])),
      }),
    );
    expect(snapshot.branch).toBe('main');
  });

  it('survives a status call that fails outright', async () => {
    const snapshot = await buildCompanionSnapshot(
      { repoPath: '/repos/studio' },
      deps({
        'repo.list': async () => ok([repo]),
        'repo.resolve': async () => ok({ repo, branch: 'main' }),
        'status.get': async () => fail(),
        'forge.pulls': async () => ok(readyPulls([])),
        'forge.checks': async () => ok(readyRuns([])),
      }),
    );
    expect(snapshot.dirty).toEqual({ staged: 0, unstaged: 0, untracked: 0 });
    expect(snapshot.ahead).toBe(0);
  });

  it('never rejects, whatever every tool answers', async () => {
    await expect(
      buildCompanionSnapshot({ repoPath: '/repos/studio' }, deps({})),
    ).resolves.toBeTruthy();
  });
});
