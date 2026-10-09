import type { WeatherLocation } from '../weather/weather-types';

/**
 * Open-Meteo's keyless geocoder — the one place place-name search lives (Phase 108 Theme G moved it out
 * of `weather-api.ts`, which re-exports it). The renderer calls it directly: `geocoding-api.open-meteo.com`
 * is already in the CSP's `connect-src`, so nothing new is allowed for Maps.
 */
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const FETCH_TIMEOUT_MS = 5000;
export const GEOCODING_RESULT_LIMIT = 8;

interface GeocodingResponse {
  results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[];
}

export async function searchLocations(query: string): Promise<WeatherLocation[]> {
  const res = await fetch(`${GEOCODING_BASE}?name=${encodeURIComponent(query)}&count=${GEOCODING_RESULT_LIMIT}&language=en&format=json`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const raw = (await res.json()) as GeocodingResponse;
  return (raw.results ?? []).map((r) => ({ name: r.name, latitude: r.latitude, longitude: r.longitude, country: r.country, admin1: r.admin1 }));
}
