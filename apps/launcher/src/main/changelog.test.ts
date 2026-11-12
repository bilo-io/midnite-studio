import { beforeEach, describe, expect, it, vi } from 'vitest';

import { answerChangelogLatest, fetchChangelog, resetChangelogCache } from './changelog';

const MD = '## [Unreleased]\n- x\n\n## [1.1.0] - 2026-02-01\n- b\n\n## [1.0.0] - 2026-01-01\n- a\n';
const ok = (body: string) => vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

beforeEach(resetChangelogCache);

describe('fetchChangelog', () => {
  it('returns the newest sections', async () => {
    const r = await fetchChangelog('studio', ok(MD));
    expect(r.error).toBeNull();
    expect(r.sections.map((s) => s.version)).toEqual(['1.1.0', '1.0.0']);
  });

  it('serves from memory inside the TTL and refetches after it', async () => {
    const f = ok(MD);
    await fetchChangelog('studio', f, () => 0);
    await fetchChangelog('studio', f, () => 60_000);
    expect(f).toHaveBeenCalledTimes(1);
    await fetchChangelog('studio', f, () => 11 * 60_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('fails soft on a bad status and on a network error, and does not cache either', async () => {
    const bad = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect((await fetchChangelog('studio', bad)).error).toMatch(/503/);
    const down = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect((await fetchChangelog('studio', down)).sections).toEqual([]);
    const f = ok(MD);
    expect((await fetchChangelog('studio', f)).sections).toHaveLength(2);
  });
});

describe('per-app fetch', () => {
  it('asks for the app\'s own file and keeps a cache per app', async () => {
    const f = ok(MD);
    await fetchChangelog('studio', f);
    await fetchChangelog('money', f);
    expect(f).toHaveBeenCalledTimes(2);
    expect((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[1]?.[0]).toMatch(/\/midnite-money\/CHANGELOG\.md$/);
    await fetchChangelog('money', f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('answers a 404 as "not published yet" and asks again next time', async () => {
    const f = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await fetchChangelog('agents', f)).toEqual({ sections: [], error: null });
    await fetchChangelog('agents', f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('answers an unknown app without fetching', async () => {
    const f = ok(MD);
    expect(await answerChangelogLatest({ app: 'nope' }, f)).toEqual({ sections: [], error: 'Unknown app.' });
    expect(await answerChangelogLatest(undefined, f)).toEqual({ sections: [], error: 'Unknown app.' });
    expect(f).not.toHaveBeenCalled();
  });
});
