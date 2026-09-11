import { describe, expect, it, vi } from 'vitest';

import {
  FetchScheduler,
  type FetchResult,
  type FetchSchedulerDeps,
  nextFetchBackoffMs,
  refShasMoved,
  computeFetchGateOpen,
} from './fetch-scheduler';

/**
 * Every external effect is injected (see the module doc), so this drives the
 * scheduler's decisions with a fake clock and a captured interval callback
 * instead of real timers or a real `git fetch`.
 */
function makeDeps(overrides: Partial<FetchSchedulerDeps> = {}) {
  const intervals = new Map<string, () => void>();
  let now = 0;
  let seq = 0;

  const broadcastedRefs: string[] = [];
  const broadcastedStatus: Array<{ repoId: string; backoffUntil: number | null; error: string | null }> = [];

  const deps: FetchSchedulerDeps = {
    now: () => now,
    setInterval: (fn) => {
      const handle = `t${seq++}`;
      intervals.set(handle, fn);
      return handle;
    },
    clearInterval: (handle) => {
      intervals.delete(handle as string);
    },
    anyWindowVisible: () => true,
    idleState: () => 'active',
    autoFetchEnabled: () => true,
    autoFetchIntervalMs: () => 60_000,
    runFetch: async () => ({ ok: true }),
    remoteRefShas: async () => new Map(),
    broadcastRefsMoved: (repoId) => broadcastedRefs.push(repoId),
    broadcastSyncStatus: (event) => broadcastedStatus.push(event),
    log: Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    ...overrides,
  };

  return {
    deps,
    intervals,
    broadcastedRefs,
    broadcastedStatus,
    advance: (ms: number) => {
      now += ms;
    },
    fireAll: () => {
      for (const fn of [...intervals.values()]) fn();
    },
  };
}

const repo = (id: string) => ({ id, path: `/tmp/${id}` });

describe('nextFetchBackoffMs', () => {
  it('starts at the base and doubles, capped at the ceiling', () => {
    expect(nextFetchBackoffMs(0)).toBe(30_000);
    expect(nextFetchBackoffMs(30_000)).toBe(60_000);
    expect(nextFetchBackoffMs(9 * 60_000)).toBe(10 * 60_000);
    expect(nextFetchBackoffMs(10 * 60_000)).toBe(10 * 60_000);
  });
});

describe('refShasMoved', () => {
  it('is false for identical maps and true for an added, removed or re-pointed ref', () => {
    const before = new Map([['origin/main', 'aaa']]);
    expect(refShasMoved(before, new Map([['origin/main', 'aaa']]))).toBe(false);
    expect(refShasMoved(before, new Map([['origin/main', 'bbb']]))).toBe(true);
    expect(refShasMoved(before, new Map([['origin/main', 'aaa'], ['origin/dev', 'ccc']]))).toBe(true);
    expect(refShasMoved(before, new Map())).toBe(true);
  });
});

describe('computeFetchGateOpen', () => {
  it('is open only when enabled, some window is visible, and the machine is not idle/locked', () => {
    const base = { autoFetchEnabled: true, anyWindowVisible: true, idleState: 'active' as const };
    expect(computeFetchGateOpen(base)).toBe(true);
    expect(computeFetchGateOpen({ ...base, autoFetchEnabled: false })).toBe(false);
    expect(computeFetchGateOpen({ ...base, anyWindowVisible: false })).toBe(false);
    expect(computeFetchGateOpen({ ...base, idleState: 'idle' })).toBe(false);
    expect(computeFetchGateOpen({ ...base, idleState: 'locked' })).toBe(false);
    expect(computeFetchGateOpen({ ...base, idleState: 'unknown' })).toBe(true);
  });
});

describe('FetchScheduler', () => {
  it('starts one timer per repo and stops one that left the registry', () => {
    const { deps, intervals } = makeDeps();
    const scheduler = new FetchScheduler(deps);

    scheduler.reconcile([repo('a'), repo('b')]);
    expect(scheduler.repoCountForTests()).toBe(2);
    expect(intervals.size).toBe(2);

    scheduler.reconcile([repo('a')]);
    expect(scheduler.repoCountForTests()).toBe(1);
    expect(intervals.size).toBe(1);
  });

  it('no visible window means a tick never spawns a fetch', async () => {
    const runFetch = vi.fn<() => Promise<FetchResult>>(async () => ({ ok: true }));
    const { deps, fireAll } = makeDeps({ anyWindowVisible: () => false, runFetch });
    const scheduler = new FetchScheduler(deps);

    scheduler.reconcile([repo('a')]);
    fireAll();
    await Promise.resolve();
    await Promise.resolve();

    expect(runFetch).not.toHaveBeenCalled();
  });

  it('a fetch that moved a ref broadcasts once; one that moved nothing broadcasts none', async () => {
    let call = 0;
    const remoteRefShas = vi.fn<() => Promise<Map<string, string>>>(async () => {
      call += 1;
      // First repo's before/after: moved. Second repo's before/after: unchanged.
      return call <= 2 ? new Map([['origin/main', call === 1 ? 'aaa' : 'bbb']]) : new Map([['origin/main', 'ccc']]);
    });
    const { deps, fireAll, broadcastedRefs } = makeDeps({
      runFetch: async () => ({ ok: true }),
      remoteRefShas,
    });
    const scheduler = new FetchScheduler(deps);

    scheduler.reconcile([repo('a')]);
    fireAll(); // repo 'a': before 'aaa', after 'bbb' -> moved
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    scheduler.reconcile([repo('b')]);
    fireAll(); // repo 'b': before 'ccc', after 'ccc' -> unchanged
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(broadcastedRefs).toEqual(['a']);
  });

  it('backs off exponentially on failure and recovers on the next success', async () => {
    let fail = true;
    const runFetch = vi.fn<() => Promise<FetchResult>>(async () =>
      fail ? { ok: false, message: 'boom' } : { ok: true },
    );
    const { deps, fireAll, broadcastedStatus, advance } = makeDeps({ runFetch });
    const scheduler = new FetchScheduler(deps);

    scheduler.reconcile([repo('a')]);
    fireAll();
    await Promise.resolve();
    await Promise.resolve();

    expect(broadcastedStatus.at(-1)?.error).toBe('boom');
    const firstBackoffUntil = broadcastedStatus.at(-1)?.backoffUntil ?? 0;
    expect(firstBackoffUntil).toBeGreaterThan(0);

    // A tick during the backoff window does not attempt again.
    fireAll();
    await Promise.resolve();
    expect(runFetch).toHaveBeenCalledTimes(1);

    // Past the backoff window, and the next attempt succeeds — recovery clears it.
    advance(firstBackoffUntil + 1);
    fail = false;
    fireAll();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(broadcastedStatus.at(-1)).toMatchObject({ backoffUntil: null, error: null });
  });

  it('catchUp runs exactly one fetch for a repo whose interval has fully elapsed', async () => {
    const runFetch = vi.fn<() => Promise<FetchResult>>(async () => ({ ok: true }));
    const { deps, advance } = makeDeps({ runFetch, autoFetchIntervalMs: () => 60_000 });
    const scheduler = new FetchScheduler(deps);

    scheduler.reconcile([repo('a')]);
    // Nothing has elapsed yet — a catch-up right after start is a no-op.
    scheduler.catchUp();
    await Promise.resolve();
    expect(runFetch).not.toHaveBeenCalled();

    advance(60_000);
    scheduler.catchUp();
    await Promise.resolve();
    await Promise.resolve();
    expect(runFetch).toHaveBeenCalledTimes(1);

    // Immediately calling catchUp again does not double-fire — the attempt
    // just ran reset `lastAttemptAt`.
    scheduler.catchUp();
    await Promise.resolve();
    expect(runFetch).toHaveBeenCalledTimes(1);
  });
});
