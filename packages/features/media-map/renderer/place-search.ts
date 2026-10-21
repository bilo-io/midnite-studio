/**
 * Open-Meteo's keyless geocoder (Phase 108 Theme G) — the place-name search behind the map's search box.
 * The renderer calls it directly: `geocoding-api.open-meteo.com` is in the app's CSP `connect-src`.
 *
 * A copy of the one Studio's weather widget keeps (`features/geo/geocode.ts`), not an import of it: this
 * package may not reach into an app, and fifteen lines are cheaper than a port for them.
 */
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const FETCH_TIMEOUT_MS = 5000;
export const GEOCODING_RESULT_LIMIT = 8;

/** One place the geocoder found. */
export type PlaceResult = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

interface GeocodingResponse {
  results?: PlaceResult[];
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const res = await fetch(`${GEOCODING_BASE}?name=${encodeURIComponent(query)}&count=${GEOCODING_RESULT_LIMIT}&language=en&format=json`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const raw = (await res.json()) as GeocodingResponse;
  return (raw.results ?? []).map((r) => ({ name: r.name, latitude: r.latitude, longitude: r.longitude, country: r.country, admin1: r.admin1 }));
}
