import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchChangelog, resetChangelogCache } from './changelog';

const MD = '## [Unreleased]\n- x\n\n## [1.1.0] - 2026-02-01\n- b\n\n## [1.0.0] - 2026-01-01\n- a\n';
const ok = (body: string) => vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

beforeEach(resetChangelogCache);

describe('fetchChangelog', () => {
  it('returns the newest sections', async () => {
    const r = await fetchChangelog(ok(MD));
    expect(r.error).toBeNull();
    expect(r.sections.map((s) => s.version)).toEqual(['1.1.0', '1.0.0']);
  });

  it('serves from memory inside the TTL and refetches after it', async () => {
    const f = ok(MD);
    await fetchChangelog(f, () => 0);
    await fetchChangelog(f, () => 60_000);
    expect(f).toHaveBeenCalledTimes(1);
    await fetchChangelog(f, () => 11 * 60_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('fails soft on a bad status and on a network error, and does not cache either', async () => {
    const bad = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect((await fetchChangelog(bad)).error).toMatch(/503/);
    const down = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect((await fetchChangelog(down)).sections).toEqual([]);
    const f = ok(MD);
    expect((await fetchChangelog(f)).sections).toHaveLength(2);
  });
});
