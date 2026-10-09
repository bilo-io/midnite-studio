/**
 * Place name → coordinates for `map_goto` (Phase 108 Theme I). The same keyless Open-Meteo geocoder the
 * Maps tab's search box calls from the renderer (`features/geo/geocode.ts`), asked for one result. The
 * fetch is injected so the tests never touch the network.
 */
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const FETCH_TIMEOUT_MS = 5000;

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

type GeocodingResponse = { results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[] };

export async function geocodePlace(query: string, fetchLike: FetchLike): Promise<{ name: string; center: [number, number] } | null> {
  const res = await fetchLike(`${GEOCODING_BASE}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The place search failed (${res.status}).`);
  const hit = ((await res.json()) as GeocodingResponse).results?.[0];
  if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null;
  const name = [hit.name, hit.admin1, hit.country].filter((part): part is string => Boolean(part)).join(', ');
  return { name, center: [hit.longitude, hit.latitude] };
}
