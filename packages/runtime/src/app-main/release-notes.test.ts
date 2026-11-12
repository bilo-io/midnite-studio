import { describe, expect, it, vi } from 'vitest';

import { EgressBlockedError, type GuardedFetch } from '../net/guarded-fetch';
import { fetchAppReleaseNotes } from './release-notes';

const CHANGELOG = `# Changelog

## [Unreleased]

## [0.0.7] - 2026-11-20

### Added

- Seventh.

## [0.0.6] - 2026-11-10

### Added

- Sixth.

## [0.0.5] - 2026-11-01

- Fifth.
`;

const ok = (text: string): GuardedFetch => vi.fn(async () => new Response(text, { status: 200 }));

describe('fetchAppReleaseNotes', () => {
  it('answers the version section and the newest sections', async () => {
    const res = await fetchAppReleaseNotes({ app: 'money', version: '0.0.7', latest: 4, fetch: ok(CHANGELOG) });
    expect(res.error).toBeNull();
    expect(res.notes).toContain('Seventh.');
    expect(res.sections?.map((s) => s.version)).toEqual(['0.0.7', '0.0.6', '0.0.5']);
  });

  it('omits sections unless asked', async () => {
    const res = await fetchAppReleaseNotes({ app: 'money', version: '0.0.7', fetch: ok(CHANGELOG) });
    expect(res.sections).toBeUndefined();
  });

  it('asks for the app’s own mirrored file', async () => {
    const fetch = ok(CHANGELOG);
    await fetchAppReleaseNotes({ app: 'money', version: '0.0.7', fetch });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('launcher');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[1])).toMatch(/\/midnite-money\/CHANGELOG\.md$/);
  });

  it('treats a 404 as not published yet, not an error', async () => {
    const fetch: GuardedFetch = async () => new Response('', { status: 404 });
    expect(await fetchAppReleaseNotes({ app: 'money', version: '0.0.7', fetch })).toEqual({ version: '0.0.7', notes: null, error: null });
  });

  it('reports other statuses', async () => {
    const fetch: GuardedFetch = async () => new Response('', { status: 503 });
    expect((await fetchAppReleaseNotes({ app: 'money', version: '0.0.7', fetch })).error).toBe('changelog: HTTP 503');
  });

  it('words a blocked fetch as turned off', async () => {
    const fetch: GuardedFetch = async () => {
      throw new EgressBlockedError('raw.githubusercontent.com', 'launcher-updates');
    };
    expect((await fetchAppReleaseNotes({ app: 'money', version: '0.0.7', fetch })).error).toBe('Release notes are turned off.');
  });

  it('carries any other failure message', async () => {
    const fetch: GuardedFetch = async () => {
      throw new Error('offline');
    };
    expect((await fetchAppReleaseNotes({ app: 'money', version: '0.0.7', fetch })).error).toBe('offline');
  });
});
