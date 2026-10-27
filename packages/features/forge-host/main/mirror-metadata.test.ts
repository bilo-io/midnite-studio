import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MANIFEST_FILE, hashMetaFiles, verifyManifest } from './mirror-manifest';
import { RateLimitError, exportMetadata, mergeRecords, withBackoff, type MetadataSource } from './mirror-metadata';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forge-host-meta-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const source = (records: Record<string, { id: number; t?: string }[]>, seen: (string | null)[] = []): MetadataSource => ({
  adapter: 'fake',
  account: 'a',
  defaultBranch: async () => null,
  records: async (kind, since) => {
    seen.push(since);
    return records[kind] ?? [];
  },
  snapshot: async (kind) => (kind === 'labels' ? [{ name: 'bug' }] : []),
});

describe('mergeRecords', () => {
  it('replaces by id and sorts numerically', () => {
    const merged = mergeRecords([{ id: 2, v: 'old' }, { id: 10 }], [{ id: 2, v: 'new' }, { id: 1 }]);
    expect(merged.map((r) => r.id)).toEqual([1, 2, 10]);
    expect(merged[1]?.v).toBe('new');
  });
});

describe('withBackoff', () => {
  it('retries a rate limit, honouring retryAfter, then succeeds', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const out = await withBackoff(
      async () => {
        n += 1;
        if (n === 1) throw new RateLimitError('429', 5000);
        if (n === 2) throw new RateLimitError('403');
        return 'ok';
      },
      { baseMs: 100, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(out).toBe('ok');
    expect(sleeps).toEqual([5000, 200]);
  });

  it('gives up after the retry budget and passes other errors straight through', async () => {
    await expect(withBackoff(async () => { throw new RateLimitError('x'); }, { retries: 1, sleep: async () => {} })).rejects.toThrow('x');
    let calls = 0;
    await expect(withBackoff(async () => { calls += 1; throw new Error('boom'); }, { sleep: async () => {} })).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });
});

describe('exportMetadata', () => {
  it('writes ndjson and snapshots at 0600, and an incremental run merges by id', async () => {
    const seen: (string | null)[] = [];
    await exportMetadata({ source: source({ issues: [{ id: 1 }, { id: 2 }] }, seen), metaDir: dir, since: null });
    expect((await stat(join(dir, 'issues.ndjson'))).mode & 0o777).toBe(0o600);
    expect((await readFile(join(dir, 'issues.ndjson'), 'utf8')).trim().split('\n')).toHaveLength(2);
    expect(JSON.parse(await readFile(join(dir, 'labels.json'), 'utf8'))).toEqual([{ name: 'bug' }]);

    await exportMetadata({ source: source({ issues: [{ id: 2, t: 'edited' }, { id: 3 }] }, seen), metaDir: dir, since: '2026-01-01T00:00:00Z' });
    const lines = (await readFile(join(dir, 'issues.ndjson'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(lines[1].t).toBe('edited');
    expect(seen).toContain('2026-01-01T00:00:00Z');
  });
});

describe('manifest verification', () => {
  it('flags an edited, a missing and an unlisted file', async () => {
    await exportMetadata({ source: source({ issues: [{ id: 1 }] }), metaDir: dir, since: null });
    const files = await hashMetaFiles(dir);
    const manifest = { fetchedAt: 'x', headRefs: {}, files, adapter: 'fake', account: 'a' };
    expect(await verifyManifest(dir, manifest)).toEqual({ ok: true });
    expect(MANIFEST_FILE).toBe('manifest.json');

    const { writeFile, unlink } = await import('node:fs/promises');
    await writeFile(join(dir, 'issues.ndjson'), 'tampered\n');
    await unlink(join(dir, 'labels.json'));
    await writeFile(join(dir, 'extra.json'), '{}');
    const check = await verifyManifest(dir, manifest);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.problems.sort()).toEqual(['extra.json: not in manifest', 'issues.ndjson: checksum mismatch', 'labels.json: missing']);
  });
});
