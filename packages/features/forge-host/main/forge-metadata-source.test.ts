import { describe, expect, it, vi } from 'vitest';

import { createForgeMetadataSource, type ForgeReadAdapter } from './forge-metadata-source';
import { RateLimitError, exportMetadata, withBackoff } from './mirror-metadata';

const cli = { reason: 'ready' as const, binPath: null, hint: '' };
const forge = { host: 'github.com', owner: 'o', repo: 'r', kind: 'github' as const };
const issue = (number: number, updatedAt: string, extra: object = {}) => ({ id: `I${number}`, number, title: 't', state: 'open' as const, author: 'a', labels: [], assignees: [], updatedAt, createdAt: null, url: '', milestone: null, ...extra });
const pull = (number: number, state: 'open' | 'closed' | 'merged', closedAt: string | null = null) => ({ id: '', number, title: 't', state, isDraft: false, reviewDecision: null, checks: null, headBranch: 'b', author: 'a', url: '', mergedAt: null, closedAt, commentCount: 0 });
const comment = (id: string, kind: 'comment' | 'review') => ({ id, kind, author: 'a', body: 'b', createdAt: '2026-01-01T00:00:00Z', url: '', reviewState: null });

function fake(overrides: Partial<ForgeReadAdapter> = {}) {
  const adapter: ForgeReadAdapter = {
    kind: 'github',
    listIssues: vi.fn(async () => ({ cli, issues: [issue(1, '2026-01-01T00:00:00Z', { labels: [{ name: 'bug', color: 'f00' }], milestone: { title: 'v1' } }), issue(2, '2026-03-01T00:00:00Z', { labels: [{ name: 'bug', color: 'f00' }] })], disabled: false, error: null })),
    listPulls: vi.fn(async () => ({ cli, pulls: [pull(10, 'open'), pull(11, 'merged', '2026-01-02T00:00:00Z'), pull(12, 'closed', '2026-03-02T00:00:00Z')], error: null })),
    issueComments: vi.fn(async (_f, n) => ({ cli, comments: [comment(`c${n}`, 'comment')], error: null })),
    pullComments: vi.fn(async (_f, n) => ({ cli, comments: [comment(`d${n}`, 'comment'), comment(`r${n}`, 'review')], error: null })),
    pullThreads: vi.fn(async () => ({ cli, threads: [], error: null })),
    ...overrides,
  };
  return adapter;
}

describe('createForgeMetadataSource', () => {
  it('exports keyed records and shares one listing across kinds', async () => {
    const adapter = fake();
    const source = createForgeMetadataSource({ adapter, forge, account: 'acct' });
    expect(source.adapter).toBe('github');
    expect((await source.records('issues', null)).map((r) => r.id)).toEqual([1, 2]);
    expect((await source.records('pulls', null)).map((r) => r.id)).toEqual([10, 11, 12]);
    const comments = await source.records('comments', null);
    expect(comments.map((r) => r.id)).toEqual(['issue1:c1', 'issue2:c2', 'pull10:d10', 'pull11:d11', 'pull12:d12']);
    const reviews = await source.records('reviews', null);
    expect(reviews.map((r) => r.id)).toEqual(['pull10:r10', 'pull11:r11', 'pull12:r12']);
    expect(adapter.listIssues).toHaveBeenCalledTimes(1);
    expect(adapter.listPulls).toHaveBeenCalledTimes(1);
  });

  it('is incremental: only changed issues, and only open or recently closed pulls', async () => {
    const adapter = fake();
    const source = createForgeMetadataSource({ adapter, forge, account: 'a' });
    const since = '2026-02-01T00:00:00Z';
    expect((await source.records('issues', since)).map((r) => r.id)).toEqual([2]);
    expect((await source.records('pulls', since)).map((r) => r.id)).toEqual([10, 11, 12]);
    expect((await source.records('reviews', since)).map((r) => r.number)).toEqual([10, 12]);
    expect(adapter.issueComments).not.toHaveBeenCalled();
  });

  it('derives labels and milestones from issues, releases empty', async () => {
    const source = createForgeMetadataSource({ adapter: fake(), forge, account: 'a' });
    expect(await source.snapshot('labels')).toEqual([{ name: 'bug', color: 'f00' }]);
    expect(await source.snapshot('milestones')).toEqual([{ title: 'v1' }]);
    expect(await source.snapshot('releases')).toEqual([]);
  });

  it('treats a disabled issue tracker as empty', async () => {
    const adapter = fake({ listIssues: async () => ({ cli, issues: [], disabled: true, error: null }) });
    expect(await createForgeMetadataSource({ adapter, forge, account: 'a' }).records('issues', null)).toEqual([]);
  });

  it('maps a rate-limit error to RateLimitError and retries past it without a stale memo', async () => {
    let calls = 0;
    const adapter = fake({
      listIssues: async () => (++calls === 1 ? { cli, issues: [], disabled: false, error: 'HTTP 403: API rate limit exceeded' } : { cli, issues: [issue(1, '2026-01-01T00:00:00Z')], disabled: false, error: null }),
    });
    const source = createForgeMetadataSource({ adapter, forge, account: 'a' });
    await expect(source.records('issues', null)).rejects.toBeInstanceOf(RateLimitError);
    const out = await withBackoff(() => source.records('issues', null), { sleep: async () => undefined });
    expect(out).toHaveLength(1);
  });

  it('turns any other adapter error and an unready CLI into a plain error', async () => {
    const bad = fake({ listPulls: async () => ({ cli, pulls: [], error: 'not found' }) });
    await expect(createForgeMetadataSource({ adapter: bad, forge, account: 'a' }).records('pulls', null)).rejects.toThrow('pulls: not found');
    const noCli = fake({ listIssues: async () => ({ cli: { reason: 'not-authenticated', binPath: null, hint: 'gh auth login' }, issues: [], disabled: false, error: null }) });
    await expect(createForgeMetadataSource({ adapter: noCli, forge, account: 'a' }).records('issues', null)).rejects.toThrow('not-authenticated');
  });

  it('refuses a listing that hit the cap rather than export a silent partial', async () => {
    const source = createForgeMetadataSource({ adapter: fake(), forge, account: 'a', limit: 2 });
    await expect(source.records('issues', null)).rejects.toThrow('cap');
  });

  it('does not mistake a number or word in an error for a rate limit, and fetches a pull conversation once', async () => {
    const bad = fake({ listPulls: async () => ({ cli, pulls: [], error: 'pull #403 not found; secondary email missing' }) });
    await expect(createForgeMetadataSource({ adapter: bad, forge, account: 'a' }).records('pulls', null)).rejects.not.toBeInstanceOf(RateLimitError);
    const adapter = fake();
    const source = createForgeMetadataSource({ adapter, forge, account: 'a' });
    await source.records('comments', null);
    await source.records('reviews', null);
    expect(adapter.pullComments).toHaveBeenCalledTimes(3);
  });

  it('treats an unreadable updatedAt as changed and tolerates clock skew', async () => {
    const adapter = fake({ listIssues: async () => ({ cli, issues: [issue(1, 'garbage'), issue(2, '2026-01-31T23:58:00Z'), issue(3, '2025-01-01T00:00:00Z')], disabled: false, error: null }) });
    const source = createForgeMetadataSource({ adapter, forge, account: 'a' });
    expect((await source.records('issues', '2026-02-01T00:00:00Z')).map((r) => r.id)).toEqual([1, 2]);
  });

  it('plugs into exportMetadata end to end', async () => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'forge-host-src-'));
    try {
      await exportMetadata({ source: createForgeMetadataSource({ adapter: fake(), forge, account: 'a' }), metaDir: dir, since: null });
      expect((await readFile(join(dir, 'issues.ndjson'), 'utf8')).trim().split('\n')).toHaveLength(2);
      expect(JSON.parse(await readFile(join(dir, 'labels.json'), 'utf8'))).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
