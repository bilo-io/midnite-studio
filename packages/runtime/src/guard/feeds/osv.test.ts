import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LockedPackage } from '../lockfiles/types';
import { createOsvClient, fixedVersions, osvKey, type FeedFetch } from './osv';

const pkg = (name: string, version: string): LockedPackage => ({ ecosystem: 'npm', name, version, direct: true, path: 'p' });
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });

describe('OSV client (Phase 122 Theme B)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'osv-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const advisory = (id: string, modified: string) => ({
    id,
    modified,
    summary: `s-${id}`,
    affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }],
  });

  it('follows pagination, hydrates each id once and caches by modified', async () => {
    const calls: string[] = [];
    const fetch: FeedFetch = async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url.replace('https://api.osv.dev', '')}`);
      if (url.endsWith('/v1/querybatch')) {
        const queries = JSON.parse(init!.body!).queries as Array<{ page_token?: string }>;
        return res({
          results: queries.map((q) =>
            q.page_token
              ? { vulns: [{ id: 'GHSA-2', modified: 'm2' }] }
              : { vulns: [{ id: 'GHSA-1', modified: 'm1' }], next_page_token: 'tok' },
          ),
        });
      }
      const id = decodeURIComponent(url.split('/').pop()!);
      return res(advisory(id, id === 'GHSA-1' ? 'm1' : 'm2'));
    };
    const client = createOsvClient({ fetch, cacheDir: dir });
    const out = await client.query([pkg('lodash', '4.17.20'), pkg('lodash', '4.17.20')]);
    const advisories = out[osvKey(pkg('lodash', '4.17.20'))]!;
    expect(advisories.map((a) => a.id)).toEqual(['GHSA-1', 'GHSA-2']);
    expect(calls.filter((c) => c.startsWith('POST'))).toHaveLength(2);
    expect(calls.filter((c) => c.includes('/vulns/'))).toHaveLength(2);
    expect((await readdir(dir)).sort()).toEqual(['GHSA-1.json', 'GHSA-2.json']);

    calls.length = 0;
    await client.query([pkg('lodash', '4.17.20')]);
    expect(calls.filter((c) => c.includes('/vulns/'))).toHaveLength(0); // second sweep re-fetches nothing unchanged
  });

  it('chunks queries at 500', async () => {
    let batches = 0;
    const fetch: FeedFetch = async (_url, init) => {
      batches++;
      return res({ results: (JSON.parse(init!.body!).queries as unknown[]).map(() => ({})) });
    };
    const pkgs = Array.from({ length: 1201 }, (_, i) => pkg(`p${i}`, '1.0.0'));
    expect(await createOsvClient({ fetch, cacheDir: dir }).query(pkgs)).toEqual({});
    expect(batches).toBe(3);
  });

  it('throws on a failed call so the runner does not read it as a clean sweep', async () => {
    const fetch: FeedFetch = async () => res({}, 503);
    await expect(createOsvClient({ fetch, cacheDir: dir }).query([pkg('a', '1.0.0')])).rejects.toThrow(/503/);
  });

  it('drops withdrawn advisories and lists fixed versions', async () => {
    const fetch: FeedFetch = async (url) =>
      url.endsWith('/v1/querybatch') ? res({ results: [{ vulns: [{ id: 'W', modified: 'm' }] }] }) : res({ ...advisory('W', 'm'), withdrawn: '2024-01-01' });
    expect(await createOsvClient({ fetch, cacheDir: dir }).query([pkg('lodash', '4.17.20')])).toEqual({});
    expect(fixedVersions(advisory('X', 'm') as never, 'npm', 'lodash')).toEqual(['4.17.21']);
  });
});
