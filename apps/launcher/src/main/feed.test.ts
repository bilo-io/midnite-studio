import { describe, expect, it } from 'vitest';

import { fetchLatestRelease, fetchStudioRelease, parseFeed } from './feed';

const fakeFetch = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('parseFeed', () => {
  it('takes the live version.json shape', () => {
    expect(
      parseFeed({
        app: 'midnite-studio',
        channel: 'stable',
        version: '0.0.1',
        releasedAt: '2026-09-28T09:19:28Z',
        notesUrl: 'https://github.com/bilo-io/midnite-apps/releases/tag/midnite-studio/v0.0.1',
      }),
    ).toEqual({
      version: '0.0.1',
      releasedAt: '2026-09-28T09:19:28Z',
      notesUrl: 'https://github.com/bilo-io/midnite-apps/releases/tag/midnite-studio/v0.0.1',
    });
  });

  it('refuses a version that could steer the download URL', () => {
    expect(parseFeed({ version: '../../evil' })).toBeNull();
    expect(parseFeed({ version: '1.0.0/../x' })).toBeNull();
    expect(parseFeed({})).toBeNull();
  });
});

describe('fetchLatestRelease', () => {
  it('reports a non-200 and a malformed feed as errors, never throwing', async () => {
    expect((await fetchLatestRelease('x', fakeFetch({}, 404))).error).toMatch(/404/);
    expect((await fetchLatestRelease('x', fakeFetch({ nope: 1 }))).error).toMatch(/No published release/);
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect((await fetchLatestRelease('x', offline)).error).toMatch(/offline/);
  });

  it('returns the release', async () => {
    expect((await fetchLatestRelease('x', fakeFetch({ version: '1.2.3' }))).release?.version).toBe('1.2.3');
  });
});

describe('fetchStudioRelease', () => {
  const catalog = {
    schemaVersion: 1,
    runtimeVersion: '0.2.0',
    apps: [
      {
        id: 'studio',
        version: '0.2.0',
        bundleUrl: 'https://example.com/studio.zip',
        size: 10,
        sha256: 'a'.repeat(64),
        minimumRuntimeVersion: '0.2.0',
        notesUrl: 'https://example.com/notes',
      },
    ],
  };
  const byUrl = (routes: Record<string, { body: unknown; status?: number }>) =>
    (async (url: string) => {
      const route = routes[url];
      return route ? new Response(JSON.stringify(route.body), { status: route.status ?? 200 }) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;

  it('prefers a valid catalog that lists Studio', async () => {
    const fetchImpl = byUrl({ cat: { body: catalog }, feed: { body: { version: '0.1.0' } } });
    const result = await fetchStudioRelease({ catalogUrl: 'cat', feedUrl: 'feed', fetchImpl });
    expect(result.release).toEqual({ version: '0.2.0', releasedAt: null, notesUrl: 'https://example.com/notes' });
  });

  it('falls back to version.json when the catalog is missing, malformed or lacks Studio', async () => {
    const feed = { body: { version: '0.1.0' } };
    for (const cat of [{ body: {}, status: 404 }, { body: { nope: 1 } }, { body: { ...catalog, apps: [] } }]) {
      const result = await fetchStudioRelease({ catalogUrl: 'cat', feedUrl: 'feed', fetchImpl: byUrl({ cat, feed }) });
      expect(result.release?.version).toBe('0.1.0');
    }
  });

  it('falls back when the catalog request itself fails, and reports a dead feed', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const result = await fetchStudioRelease({ catalogUrl: 'cat', feedUrl: 'feed', fetchImpl });
    expect(calls).toEqual(['cat', 'feed']);
    expect(result.error).toMatch(/offline/);
  });
});
