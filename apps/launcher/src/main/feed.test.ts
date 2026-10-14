import { describe, expect, it } from 'vitest';

import { fetchLatestRelease, parseFeed } from './feed';

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
