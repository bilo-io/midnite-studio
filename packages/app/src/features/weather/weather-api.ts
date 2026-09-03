import type { WeatherLocation, WeatherReading, WeatherUnit } from './weather-types';

/**
 * Open-Meteo, keyless — the phase's own decision, taking the keyless path
 * `finance-api.ts` already proves out for crypto rather than the keyed one it
 * uses for stocks. A widget on a lock screen has no room for a settings field,
 * a secret store and an empty-state for a missing key.
 */
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 5000;
const GEOCODING_RESULT_LIMIT = 8;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

interface GeocodingResponse {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
  }[];
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
}

export async function searchLocations(query: string): Promise<WeatherLocation[]> {
  const raw = await fetchJson<GeocodingResponse>(
    `${GEOCODING_BASE}?name=${encodeURIComponent(query)}&count=${GEOCODING_RESULT_LIMIT}&language=en&format=json`,
  );
  return (raw.results ?? []).map((r) => ({
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country,
    admin1: r.admin1,
  }));
}

export async function getCurrentWeather(
  location: WeatherLocation,
  unit: WeatherUnit,
): Promise<WeatherReading> {
  const raw = await fetchJson<ForecastResponse>(
    `${FORECAST_BASE}?latitude=${location.latitude}&longitude=${location.longitude}` +
      `&current=temperature_2m,weather_code&temperature_unit=${unit}`,
  );
  const temperature = raw.current?.temperature_2m;
  const weatherCode = raw.current?.weather_code;
  if (temperature === undefined || weatherCode === undefined) {
    throw new Error('weather data unavailable');
  }
  return { temperature, weatherCode };
}
