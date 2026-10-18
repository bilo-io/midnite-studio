/**
 * The online metadata seam (Phase 113 Theme R) — **off by default**, and asked only when the user has
 * switched it on in the library's settings and the provider's key is readable in main (Studio's vault,
 * or — in Midnite Media — the runtime host's vault behind the user's grant).
 *
 * The one provider is TMDB: a title search for films or shows, the best match's overview and year, and
 * its poster, downloaded once into the library's art cache. `fetch` is injected, so tests hand in one
 * that answers from fixtures and the suite never reaches the network; nothing here runs with the switch
 * off, which `library-service.test.ts` proves with a fetch that fails the test if it is ever called.
 */

export type OnlineQuery = { kind: 'film' | 'show'; title: string; year: number | null };

export type OnlineMatch = {
  title: string;
  year: number | null;
  plot: string | null;
  poster: { bytes: Uint8Array; mime: string } | null;
};

export type OnlineProvider = {
  id: 'tmdb';
  lookup: (query: OnlineQuery, key: string) => Promise<OnlineMatch | null>;
};

const API = 'https://api.themoviedb.org/3';
const IMAGES = 'https://image.tmdb.org/t/p/w500';
/** A poster is a few hundred KB; anything far larger is not one. */
const POSTER_CAP_BYTES = 8 * 1024 * 1024;

type TmdbResult = {
  title?: string;
  name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
};

/**
 * A v4 read-access token (a JWT, `eyJ…`) goes in an `Authorization` header; a v3 key is a query
 * parameter. Either way it is sent only to TMDB's own host.
 */
function authorise(url: URL, key: string): Record<string, string> {
  if (key.startsWith('eyJ')) return { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  url.searchParams.set('api_key', key);
  return { Accept: 'application/json' };
}

export function createTmdbProvider(fetchFn: typeof fetch): OnlineProvider {
  return {
    id: 'tmdb',
    async lookup(query, key) {
      const url = new URL(`${API}/search/${query.kind === 'film' ? 'movie' : 'tv'}`);
      url.searchParams.set('query', query.title);
      url.searchParams.set('include_adult', 'false');
      if (query.year !== null)
        url.searchParams.set(
          query.kind === 'film' ? 'year' : 'first_air_date_year',
          String(query.year),
        );
      const response = await fetchFn(url.toString(), { headers: authorise(url, key) });
      if (!response.ok) return null;
      const body = (await response.json()) as { results?: TmdbResult[] };
      const best = body.results?.[0];
      if (!best) return null;
      const date = best.release_date ?? best.first_air_date ?? '';
      const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
      let poster: OnlineMatch['poster'] = null;
      if (best.poster_path && /^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(best.poster_path)) {
        const image = await fetchFn(`${IMAGES}${best.poster_path}`);
        // A length up front, or no poster: without one, `arrayBuffer()` would buffer an unbounded body
        // before the cap below could refuse it.
        const length = Number(image.headers.get('content-length') ?? 'NaN');
        if (image.ok && Number.isFinite(length) && length > 0 && length <= POSTER_CAP_BYTES) {
          const bytes = new Uint8Array(await image.arrayBuffer());
          if (bytes.length > 0 && bytes.length <= POSTER_CAP_BYTES) {
            poster = {
              bytes,
              mime: best.poster_path.endsWith('.png') ? 'image/png' : 'image/jpeg',
            };
          }
        }
      }
      return {
        title: best.title ?? best.name ?? query.title,
        year,
        plot: best.overview && best.overview.trim() !== '' ? best.overview.trim() : null,
        poster,
      };
    },
  };
}
