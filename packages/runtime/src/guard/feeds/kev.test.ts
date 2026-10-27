import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadKev, parseKevFeed } from './kev';
import type { FeedFetch } from './osv';

const feed = {
  vulnerabilities: [
    { cveID: 'CVE-2024-1', vendorProject: 'Apple', product: 'macOS', dueDate: '2024-06-01', knownRansomwareCampaignUse: 'Known' },
    { nope: true },
  ],
};

describe('KEV feed (Phase 122 Theme B)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kev-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('validates entry by entry', () => {
    expect(Object.keys(parseKevFeed(feed))).toEqual(['CVE-2024-1']);
    expect(parseKevFeed({ wrong: 1 })).toEqual({});
  });

  it('sends If-Modified-Since, reuses the cache on 304 and on a network failure', async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    let mode: 'ok' | '304' | 'down' = 'ok';
    const fetch: FeedFetch = async (_u, init) => {
      seen.push(init?.headers);
      if (mode === 'down') throw new Error('offline');
      if (mode === '304') return { ok: false, status: 304, headers: { get: () => null }, json: async () => null, text: async () => '' };
      return { ok: true, status: 200, headers: { get: (n) => (n === 'last-modified' ? 'Mon, 01 Jan 2024 00:00:00 GMT' : null) }, json: async () => feed, text: async () => '' };
    };
    expect(Object.keys(await loadKev({ fetch, cacheDir: dir }))).toEqual(['CVE-2024-1']);
    mode = '304';
    expect(Object.keys(await loadKev({ fetch, cacheDir: dir }))).toEqual(['CVE-2024-1']);
    expect(seen[1]).toEqual({ 'if-modified-since': 'Mon, 01 Jan 2024 00:00:00 GMT' });
    mode = 'down';
    expect(Object.keys(await loadKev({ fetch, cacheDir: dir }))).toEqual(['CVE-2024-1']);
  });
});
