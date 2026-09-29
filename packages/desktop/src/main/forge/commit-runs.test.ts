import { ForgeRunSchema, type Forge, type ForgeRun, type ForgeRunsResult } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { ForgeAdapter } from './adapter';
import {
  ACTIVE_TTL_MS,
  createCommitRunsService,
  FRESH_EMPTY_TTL_MS,
  RECENT_LIMIT,
  RECENT_TTL_MS,
  SETTLED_TTL_MS,
} from './commit-runs';

const FORGE: Forge = { host: 'github.com', owner: 'acme', repo: 'widgets', kind: 'github' };
const READY = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };
const NO_FORGE = { reason: 'not-installed' as const, binPath: null, hint: 'no forge' };

const sha = (c: string) => c.repeat(40);

let nextId = 1;
const run = (headSha: string, over: Partial<ForgeRun> = {}): ForgeRun =>
  ForgeRunSchema.parse({
    id: String(nextId++),
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    headSha,
    createdAt: '2026-09-01T10:00:00Z',
    url: 'https://github.com/acme/widgets/actions/runs/1',
    ...over,
  });

const ok = (runs: ForgeRun[]): ForgeRunsResult => ({ cli: READY, runs, error: null });

/** `count` filler runs against unrelated commits, so the recent page is "full". */
const filler = (count: number) => Array.from({ length: count }, () => run(sha('f')));

function setup(opts: {
  recent: () => Promise<ForgeRunsResult>;
  perCommit?: (sha: string) => Promise<ForgeRunsResult>;
  resolve?: () => Promise<{ forge: Forge; adapter: ForgeAdapter } | null>;
}) {
  let clock = 1_000_000;
  const listRuns = vi.fn(opts.recent);
  const listRunsForCommit = opts.perCommit ? vi.fn((_f: Forge, s: string) => opts.perCommit!(s)) : undefined;
  const adapter = { kind: 'github', listRuns, ...(listRunsForCommit ? { listRunsForCommit } : {}) } as unknown as ForgeAdapter;
  const service = createCommitRunsService({
    resolve: opts.resolve ?? (async () => ({ forge: FORGE, adapter })),
    noForge: () => NO_FORGE,
    now: () => clock,
  });
  return {
    service,
    listRuns,
    listRunsForCommit,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('commit runs lookup', () => {
  it('answers a whole batch from one recent listing', async () => {
    const a = sha('a');
    const b = sha('b');
    const { service, listRuns, listRunsForCommit } = setup({
      recent: async () => ok([run(a), run(b, { conclusion: 'failure' }), ...filler(RECENT_LIMIT - 2)]),
      perCommit: async () => ok([]),
    });
    const result = await service.lookup('repo', [a, b]);
    expect(listRuns).toHaveBeenCalledTimes(1);
    expect(listRuns).toHaveBeenCalledWith(FORGE, { limit: RECENT_LIMIT });
    expect(listRunsForCommit).not.toHaveBeenCalled();
    expect(result.runs[a]).toHaveLength(1);
    expect(result.runs[b]?.[0]?.conclusion).toBe('failure');
    expect(result.error).toBeNull();
  });

  it('falls back per commit only for a sha the recent page did not reach', async () => {
    const old = sha('c');
    const { service, listRunsForCommit } = setup({
      recent: async () => ok(filler(RECENT_LIMIT)),
      perCommit: async (s) => ok([run(s), run(sha('d'))]),
    });
    const result = await service.lookup('repo', [old]);
    expect(listRunsForCommit).toHaveBeenCalledTimes(1);
    // Another commit's run in the answer is filtered out, never painted here.
    expect(result.runs[old]).toHaveLength(1);
    expect(result.runs[old]?.[0]?.headSha).toBe(old);
  });

  it('treats a short recent page as the whole history — no fallback needed', async () => {
    const none = sha('e');
    const { service, listRunsForCommit } = setup({
      recent: async () => ok([run(sha('a'))]),
      perCommit: async () => ok([]),
    });
    const result = await service.lookup('repo', [none]);
    expect(listRunsForCommit).not.toHaveBeenCalled();
    expect(result.runs[none]).toEqual([]);
  });

  it('answers from the recent page alone for an adapter with no per-commit read', async () => {
    const none = sha('e');
    const { service } = setup({ recent: async () => ok(filler(RECENT_LIMIT)) });
    const result = await service.lookup('repo', [none]);
    expect(result.runs[none]).toEqual([]);
  });

  it('caches a settled answer for the settled TTL and re-reads it after', async () => {
    const a = sha('a');
    const { service, listRuns, advance } = setup({
      recent: async () => ok([run(a), ...filler(RECENT_LIMIT - 1)]),
    });
    await service.lookup('repo', [a]);
    advance(SETTLED_TTL_MS - 1);
    await service.lookup('repo', [a]);
    expect(listRuns).toHaveBeenCalledTimes(1);
    advance(2);
    await service.lookup('repo', [a]);
    expect(listRuns).toHaveBeenCalledTimes(2);
  });

  it('re-reads an active answer after the short TTL', async () => {
    const a = sha('a');
    const { service, listRuns, advance } = setup({
      recent: async () => ok([run(a, { status: 'in_progress', conclusion: null }), ...filler(RECENT_LIMIT - 1)]),
    });
    await service.lookup('repo', [a]);
    advance(Math.max(ACTIVE_TTL_MS, RECENT_TTL_MS));
    await service.lookup('repo', [a]);
    expect(listRuns).toHaveBeenCalledTimes(2);
  });

  it('keeps a fresh "no runs" briefly, so a just-pushed commit picks up its run', async () => {
    const pushed = sha('a');
    const { service, listRuns, advance } = setup({ recent: async () => ok([run(sha('b'))]) });
    await service.lookup('repo', [pushed]);
    advance(FRESH_EMPTY_TTL_MS - 1);
    await service.lookup('repo', [pushed]);
    expect(listRuns).toHaveBeenCalledTimes(1);
    advance(2);
    await service.lookup('repo', [pushed]);
    expect(listRuns).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight recent listing between concurrent batches', async () => {
    const { service, listRuns } = setup({ recent: async () => ok([run(sha('a'))]) });
    await Promise.all([service.lookup('repo', [sha('a')]), service.lookup('repo', [sha('b')])]);
    expect(listRuns).toHaveBeenCalledTimes(1);
  });

  it('reports no forge as an empty answer with no error', async () => {
    const { service } = setup({ recent: async () => ok([]), resolve: async () => null });
    expect(await service.lookup('repo', [sha('a')])).toEqual({ cli: NO_FORGE, runs: {}, error: null });
  });

  it('never throws — an unreachable forge is an envelope, and is not cached', async () => {
    let fail = true;
    const a = sha('a');
    const { service, listRuns } = setup({
      recent: async () => {
        if (fail) throw new Error('spawn gh ENOENT');
        return ok([run(a)]);
      },
    });
    const first = await service.lookup('repo', [a]);
    expect(first.error).toBe('spawn gh ENOENT');
    expect(first.runs).toEqual({});
    fail = false;
    const second = await service.lookup('repo', [a]);
    expect(listRuns).toHaveBeenCalledTimes(2);
    expect(second.runs[a]).toHaveLength(1);
  });

  it('passes a signed-out CLI through without caching anything', async () => {
    const signedOut = { reason: 'not-authenticated' as const, binPath: '/usr/bin/gh', hint: 'gh auth login' };
    const { service } = setup({ recent: async () => ({ cli: signedOut, runs: [], error: null }) });
    const result = await service.lookup('repo', [sha('a')]);
    expect(result.cli).toEqual(signedOut);
    expect(result.runs).toEqual({});
  });
});
