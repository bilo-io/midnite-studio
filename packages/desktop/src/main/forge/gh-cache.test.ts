import type { Forge } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKFLOW_CACHE_MAX, clearForgeRunCache, forgetRun, listWorkflows, runDetail, runLog } from './gh-cli';

/**
 * Main's run cache, and the one write that has to break it.
 *
 * `runDetail` and `runLog` remember a run permanently once it has *completed* —
 * a finished run is finished, so re-fetching its job tree is a rate-limited API
 * call spent on a payload that cannot have changed. `gh run rerun` is the single
 * thing in the app that falsifies that: it adds an attempt to the **same run
 * id** rather than creating a new run, so the cached entry is the previous
 * attempt's failure and would be served forever.
 *
 * These tests count spawns rather than inspecting the cache, because the spawn
 * is the cost the cache exists to avoid — and it is the observable a stale entry
 * would silently remove.
 */
const { runInShell } = vi.hoisted(() => ({
  runInShell: vi.fn<
    (
      command: string,
      timeout: number,
      options?: { combine?: boolean },
    ) => Promise<{ output: string; stdout: string; stderr: string; exitCode: number | null }>
  >(),
}));

vi.mock('./gh-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gh-shell')>();
  return {
    ...actual,
    runInShell,
    ghStatus: vi.fn(async () => ({ reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' })),
    invalidateGhProbe: vi.fn(),
  };
});

const FORGE: Forge = { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' };

/** A completed run — the only kind that gets cached. */
const COMPLETED = {
  databaseId: 9001,
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  headBranch: 'feature/writes',
  createdAt: '2026-08-27T09:00:00Z',
  url: 'https://github.com/bilo-io/midnite-studio/actions/runs/9001',
  jobs: [
    {
      databaseId: 21,
      name: 'test',
      status: 'completed',
      conclusion: 'failure',
      startedAt: '2026-08-27T09:00:10Z',
      completedAt: '2026-08-27T09:04:00Z',
      url: 'https://github.com/bilo-io/midnite-studio/actions/runs/9001/job/21',
      steps: [],
    },
  ],
};

const jsonOk = (payload: unknown) => {
  const output = JSON.stringify(payload);
  return { output, stdout: output, stderr: '', exitCode: 0 };
};

beforeEach(() => {
  runInShell.mockReset();
  clearForgeRunCache();
});

describe('the completed-run cache', () => {
  it('spawns once for a run it has already read', async () => {
    runInShell.mockResolvedValue(jsonOk(COMPLETED));

    await runDetail(FORGE, '9001');
    await runDetail(FORGE, '9001');

    expect(runInShell).toHaveBeenCalledTimes(1);
  });

  it('re-reads a run after it has been re-run', async () => {
    runInShell.mockResolvedValue(jsonOk(COMPLETED));
    await runDetail(FORGE, '9001');
    expect(runInShell).toHaveBeenCalledTimes(1);

    // Without this, re-running from the Checks tab would show the run queue and
    // finish, then keep rendering the previous attempt's failed tree for as long
    // as the app stayed open.
    forgetRun(FORGE, '9001');
    await runDetail(FORGE, '9001');

    expect(runInShell).toHaveBeenCalledTimes(2);
  });

  it('drops the run’s logs too, including a single job’s', async () => {
    // The log cache is keyed by run id plus a job/`full` suffix, so its entries
    // have to be matched by prefix rather than looked up — a re-run invalidates
    // every one of them, not just the whole-run log.
    const log = { output: 'test\tstep\t2026-08-27T09:04:00Z boom', stdout: '', stderr: '', exitCode: 0 };
    log.stdout = log.output;
    runInShell.mockResolvedValue(log);

    await runLog(FORGE, '9001', {});
    await runLog(FORGE, '9001', { jobId: '21' });
    expect(runInShell).toHaveBeenCalledTimes(2);

    // Both are cached now.
    await runLog(FORGE, '9001', {});
    await runLog(FORGE, '9001', { jobId: '21' });
    expect(runInShell).toHaveBeenCalledTimes(2);

    forgetRun(FORGE, '9001');
    await runLog(FORGE, '9001', {});
    await runLog(FORGE, '9001', { jobId: '21' });
    expect(runInShell).toHaveBeenCalledTimes(4);
  });

  it('leaves another run’s cache alone', async () => {
    runInShell.mockResolvedValue(jsonOk(COMPLETED));
    await runDetail(FORGE, '9001');
    await runDetail(FORGE, '9002');
    expect(runInShell).toHaveBeenCalledTimes(2);

    forgetRun(FORGE, '9001');
    await runDetail(FORGE, '9002');

    expect(runInShell).toHaveBeenCalledTimes(2);
  });

  it('scopes the eviction to one forge, not one run id', async () => {
    // The key carries host and slug, because two repositories' run ids collide
    // freely and evicting by number alone would drop an unrelated tree.
    const other: Forge = { ...FORGE, owner: 'someone-else' };
    runInShell.mockResolvedValue(jsonOk(COMPLETED));
    await runDetail(FORGE, '9001');
    await runDetail(other, '9001');
    expect(runInShell).toHaveBeenCalledTimes(2);

    forgetRun(FORGE, '9001');
    await runDetail(other, '9001');

    expect(runInShell).toHaveBeenCalledTimes(2);
  });
});

/**
 * `workflowCache` (Phase 45 Theme E): had a TTL but no cap, unlike its two
 * LRU neighbours above — a session opening many distinct repos in one day
 * grew it forever. Now bounded via the same `remember` LRU idiom.
 */
describe('the workflow cache', () => {
  it('spawns once per forge within the TTL window', async () => {
    runInShell.mockResolvedValue(jsonOk([]));

    await listWorkflows(FORGE);
    await listWorkflows(FORGE);

    expect(runInShell).toHaveBeenCalledTimes(1);
  });

  it('evicts the least-recently-used entry once the cap is exceeded', async () => {
    runInShell.mockResolvedValue(jsonOk([]));

    // Fill the cache to its cap, one distinct forge per entry.
    for (let i = 0; i < WORKFLOW_CACHE_MAX; i += 1) {
      await listWorkflows({ ...FORGE, owner: `owner-${i}` });
    }
    expect(runInShell).toHaveBeenCalledTimes(WORKFLOW_CACHE_MAX);

    // One more forge pushes the map past its cap — the very first entry
    // (owner-0), untouched since, is the one that should fall out.
    await listWorkflows({ ...FORGE, owner: 'owner-overflow' });
    expect(runInShell).toHaveBeenCalledTimes(WORKFLOW_CACHE_MAX + 1);

    await listWorkflows({ ...FORGE, owner: 'owner-0' });
    expect(runInShell).toHaveBeenCalledTimes(WORKFLOW_CACHE_MAX + 2);
  });
});
