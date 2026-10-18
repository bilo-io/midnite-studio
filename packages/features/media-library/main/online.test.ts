// vitest: the TMDB provider over a fixture fetch — the network is never reached.
import { describe, expect, it } from 'vitest';

import { createTmdbProvider } from './online';

const SEARCH = {
  results: [
    { title: 'Heat', release_date: '1995-12-15', overview: 'A heist.', poster_path: '/heat.jpg' },
  ],
};

function fixtureFetch(posterHeaders: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.themoviedb.org')
      return new Response(JSON.stringify(SEARCH), { status: 200 });
    if (url.hostname === 'image.tmdb.org')
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: posterHeaders,
      });
    throw new Error(`unexpected host ${url.hostname}`);
  }) as typeof fetch;
}

describe('createTmdbProvider', () => {
  it('takes a poster whose length is declared and within the cap', async () => {
    const match = await createTmdbProvider(fixtureFetch({ 'content-length': '3' })).lookup(
      { kind: 'film', title: 'Heat', year: 1995 },
      'k',
    );
    expect(match?.poster?.bytes.length).toBe(3);
    expect(match?.plot).toBe('A heist.');
  });

  it('skips a poster with no declared length rather than buffering an unbounded body', async () => {
    const match = await createTmdbProvider(fixtureFetch({})).lookup(
      { kind: 'film', title: 'Heat', year: 1995 },
      'k',
    );
    expect(match?.title).toBe('Heat');
    expect(match?.poster).toBeNull();
  });
});
