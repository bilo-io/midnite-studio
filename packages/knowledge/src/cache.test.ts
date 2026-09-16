// Layer: vitest (Phase 82) — pure fs round-trip against a temp dir, no browser capability needed.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { layoutCacheKey, readLayoutCache, writeLayoutCache } from './cache';

describe('layoutCacheKey', () => {
  it('changes when built_at_commit changes', () => {
    expect(layoutCacheKey('sha1', 1)).not.toBe(layoutCacheKey('sha2', 1));
  });

  it('changes when the projection version changes', () => {
    expect(layoutCacheKey('sha1', 1)).not.toBe(layoutCacheKey('sha1', 2));
  });

  it('is stable for the same inputs', () => {
    expect(layoutCacheKey('sha1', 1)).toBe(layoutCacheKey('sha1', 1));
  });
});

describe('readLayoutCache / writeLayoutCache', () => {
  let cacheDir: string;
  const repoId = 'repo:/Users/bilo/dev/midnite-studio';

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'knowledge-cache-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('returns null for a repo with no cache entry yet', async () => {
    const result = await readLayoutCache(cacheDir, repoId, layoutCacheKey('sha1', 1));
    expect(result).toBeNull();
  });

  it('round-trips a written entry under the same key', async () => {
    const entry = {
      builtAtCommit: 'sha1',
      projectionVersion: 1,
      nodeCount: 2,
      linkCount: 1,
      positions: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } },
    };
    await writeLayoutCache(cacheDir, repoId, entry);
    const result = await readLayoutCache(cacheDir, repoId, layoutCacheKey('sha1', 1));
    expect(result).toEqual(entry);
  });

  it('treats a written entry as a miss once built_at_commit no longer matches', async () => {
    await writeLayoutCache(cacheDir, repoId, {
      builtAtCommit: 'sha1',
      projectionVersion: 1,
      nodeCount: 0,
      linkCount: 0,
      positions: {},
    });
    const result = await readLayoutCache(cacheDir, repoId, layoutCacheKey('sha2', 1));
    expect(result).toBeNull();
  });

  it('keeps two repos in separate entries', async () => {
    const otherRepoId = 'repo:/Users/bilo/dev/other-repo';
    await writeLayoutCache(cacheDir, repoId, {
      builtAtCommit: 'sha1',
      projectionVersion: 1,
      nodeCount: 1,
      linkCount: 0,
      positions: { a: { x: 0, y: 0 } },
    });
    const otherResult = await readLayoutCache(cacheDir, otherRepoId, layoutCacheKey('sha1', 1));
    expect(otherResult).toBeNull();

    const ownResult = await readLayoutCache(cacheDir, repoId, layoutCacheKey('sha1', 1));
    expect(ownResult).not.toBeNull();
  });

  it('survives two concurrent writes for the same repo from one process', async () => {
    const entry = (n: number) => ({
      builtAtCommit: 'abc',
      projectionVersion: 2,
      nodeCount: n,
      linkCount: 0,
      positions: {},
    });
    await Promise.all([
      writeLayoutCache(cacheDir, 'repo:x', entry(1)),
      writeLayoutCache(cacheDir, 'repo:x', entry(2)),
    ]);
    const read = await readLayoutCache(cacheDir, 'repo:x', layoutCacheKey('abc', 2));
    expect(read).not.toBeNull();
    expect([1, 2]).toContain(read?.nodeCount);
  });
});
