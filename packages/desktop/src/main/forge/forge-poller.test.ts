import { describe, expect, it, vi } from 'vitest';
import type { Forge } from '@midnite/studio-shared';

import {
  ForgePoller,
  type ForgePollerDeps,
  type PollOutcome,
  hashProjection,
  looksRateLimited,
  nextForgePollBackoffMs,
} from './forge-poller';

const FORGE: Forge = { kind: 'github', host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio' };

function makeDeps(overrides: Partial<ForgePollerDeps> = {}) {
  const intervals = new Map<string, () => void>();
  let now = 0;
  let seq = 0;

  const changed: Array<{ repoId: string; kind: string }> = [];
  const status: Array<{ repoId: string; backoffUntil: number | null; error: string | null }> = [];

  const deps: ForgePollerDeps = {
    now: () => now,
    setInterval: (fn) => {
      const handle = `t${seq++}`;
      intervals.set(handle, fn);
      return handle;
    },
    clearInterval: (handle) => {
      intervals.delete(handle as string);
    },
    resolveForge: async () => FORGE,
    poll: async (): Promise<PollOutcome> => ({ ok: true, hash: 'same' }),
    broadcastChanged: (repoId, kind) => changed.push({ repoId, kind }),
    broadcastSyncStatus: (event) => status.push(event),
    log: Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    ...overrides,
  };

  return {
    deps,
    intervals,
    changed,
    status,
    advance: (ms: number) => {
      now += ms;
    },
    fireAll: () => {
      for (const fn of [...intervals.values()]) fn();
    },
  };
}

describe('nextForgePollBackoffMs', () => {
  it('starts at the base and doubles, capped at the ceiling', () => {
    expect(nextForgePollBackoffMs(0)).toBe(30_000);
    expect(nextForgePollBackoffMs(30_000)).toBe(60_000);
    expect(nextForgePollBackoffMs(10 * 60_000)).toBe(10 * 60_000);
  });
});

describe('looksRateLimited', () => {
  it('matches a 403/rate-limit message and nothing else', () => {
    expect(looksRateLimited('API rate limit exceeded for user ID 123.')).toBe(true);
    expect(looksRateLimited('HTTP 403: Forbidden')).toBe(true);
    expect(looksRateLimited('Could not resolve host')).toBe(false);
  });
});

describe('hashProjection', () => {
  it('is stable for identical input and differs when content differs', () => {
    const a = hashProjection([{ id: '1', status: 'completed' }]);
    const b = hashProjection([{ id: '1', status: 'completed' }]);
    const c = hashProjection([{ id: '1', status: 'in_progress' }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('ForgePoller', () => {
  it('starts polling on the first subscriber and stops on the last unsubscribe', () => {
    const { deps, intervals } = makeDeps();
    const poller = new ForgePoller(deps);

    poller.subscribe('repo-a', 'runs', 1);
    expect(intervals.size).toBe(1);
    expect(poller.activeKeyCountForTests()).toBe(1);

    // A second subscriber to the SAME key does not start a second timer.
    poller.subscribe('repo-a', 'runs', 2);
    expect(intervals.size).toBe(1);

    poller.unsubscribe('repo-a', 'runs', 1);
    expect(intervals.size).toBe(1); // window 2 still subscribed

    poller.unsubscribe('repo-a', 'runs', 2);
    expect(intervals.size).toBe(0);
    expect(poller.activeKeyCountForTests()).toBe(0);
  });

  it('a window closing drops every key it was subscribed to', () => {
    const { deps, intervals } = makeDeps();
    const poller = new ForgePoller(deps);

    poller.subscribe('repo-a', 'runs', 1);
    poller.subscribe('repo-a', 'pulls', 1);
    poller.subscribe('repo-b', 'issues', 1);
    expect(intervals.size).toBe(3);

    poller.dropWindow(1);
    expect(intervals.size).toBe(0);
  });

  it('an unchanged hash emits nothing; a changed hash pings once', async () => {
    let hash = 'v1';
    const poll = vi.fn<() => Promise<PollOutcome>>(async () => ({ ok: true, hash }));
    const { deps, fireAll, changed } = makeDeps({ poll });
    const poller = new ForgePoller(deps);

    poller.subscribe('repo-a', 'runs', 1); // immediate poll on first subscriber
    await Promise.resolve();
    await Promise.resolve();
    expect(changed).toHaveLength(0); // first poll only seeds lastHash

    fireAll();
    await Promise.resolve();
    await Promise.resolve();
    expect(changed).toHaveLength(0); // same hash, no ping

    hash = 'v2';
    fireAll();
    await Promise.resolve();
    await Promise.resolve();
    expect(changed).toEqual([{ repoId: 'repo-a', kind: 'runs' }]);
  });

  it('a rate-limit response backs off and reports backoffUntil', async () => {
    const poll = vi.fn<() => Promise<PollOutcome>>(async () => ({
      ok: false,
      message: 'API rate limit exceeded',
      rateLimited: true,
    }));
    const { deps, status } = makeDeps({ poll });
    const poller = new ForgePoller(deps);

    poller.subscribe('repo-a', 'issues', 1);
    await Promise.resolve();
    await Promise.resolve();

    expect(status.at(-1)).toMatchObject({ repoId: 'repo-a', error: 'API rate limit exceeded' });
    expect(status.at(-1)?.backoffUntil).toBeGreaterThan(0);
  });

  it('no GitHub remote is a no-op, not a failure', async () => {
    const poll = vi.fn<() => Promise<PollOutcome>>(async () => ({ ok: true, hash: 'x' }));
    const { deps, status } = makeDeps({ poll, resolveForge: async () => null });
    const poller = new ForgePoller(deps);

    poller.subscribe('repo-a', 'projects', 1);
    await Promise.resolve();
    await Promise.resolve();

    expect(poll).not.toHaveBeenCalled();
    expect(status).toHaveLength(0);
  });
});
