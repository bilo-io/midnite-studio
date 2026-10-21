import type { WeatherLocation, WeatherReading, WeatherUnit } from './weather-types';

/**
 * Open-Meteo, keyless — the phase's own decision, taking the keyless path
 * `finance-api.ts` already proves out for crypto rather than the keyed one it
 * uses for stocks. A widget on a lock screen has no room for a settings field,
 * a secret store and an empty-state for a missing key.
 */
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 5000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
}

export { searchLocations } from '../geo/geocode';

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
