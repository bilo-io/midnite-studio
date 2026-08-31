import type {
  WeatherGeocodeResult,
  WeatherLocateResponse,
  WeatherResponse,
} from './titlebar-status-types';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const IP_GEO_BASE = 'https://ipwho.is';
const FETCH_TIMEOUT_MS = 8000;

interface RawForecast {
  current?: {
    temperature_2m?: number;
    precipitation?: number;
    weather_code?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    weather_code?: number[];
  };
}

interface RawIpGeo {
  success?: boolean;
  message?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

interface RawGeocode {
  results?: {
    id?: number;
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    admin1?: string;
  }[];
}

/** Fetches current conditions and daily forecast from Open-Meteo API. */
export async function getWeather(lat: number, lon: number): Promise<WeatherResponse> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,precipitation,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    timezone: 'auto',
  });

  const res = await fetch(`${OPEN_METEO_BASE}?${params.toString()}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Open-Meteo → ${res.status} ${res.statusText}`);
  const raw = (await res.json()) as RawForecast;

  const current = raw.current ?? {};
  const daily = raw.daily ?? {};

  const mapped: WeatherResponse = {
    current: {
      temperatureC: current.temperature_2m ?? 0,
      weatherCode: current.weather_code ?? 0,
      precipitation: current.precipitation ?? 0,
    },
    today: {
      highC: daily.temperature_2m_max?.[0] ?? 0,
      lowC: daily.temperature_2m_min?.[0] ?? 0,
      precipitationProbability: daily.precipitation_probability_max?.[0] ?? 0,
      weatherCode: daily.weather_code?.[0] ?? current.weather_code ?? 0,
    },
    resolvedAt: new Date().toISOString(),
  };

  return mapped;
}

/** Coarse location resolution from IP via ipwho.is. */
export async function locateByIp(): Promise<WeatherLocateResponse> {
  const res = await fetch(IP_GEO_BASE, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ipwho.is → ${res.status} ${res.statusText}`);
  const raw = (await res.json()) as RawIpGeo;
  if (raw.success === false) throw new Error(raw.message ?? 'Location provider failure');

  const { latitude: lat, longitude: lon } = raw;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('Provider returned no coordinates');
  }

  const label = [raw.city, raw.region, raw.country]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(', ');

  const data: WeatherLocateResponse = { lat, lon, label: label || null };
  return data;
}

/** Geocodes a place name string to candidate coordinates via Open-Meteo geocoding. */
export async function geocodePlace(query: string): Promise<WeatherGeocodeResult[]> {
  const params = new URLSearchParams({ name: query.trim(), count: '5', format: 'json' });
  const res = await fetch(`${OPEN_METEO_GEOCODE}?${params.toString()}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Open-Meteo geocoding → ${res.status} ${res.statusText}`);
  const raw = (await res.json()) as RawGeocode;

  const results: WeatherGeocodeResult[] = (raw.results ?? []).flatMap((r) => {
    const { id, name, latitude: lat, longitude: lon } = r;
    if (typeof id !== 'number' || !name || typeof lat !== 'number' || typeof lon !== 'number') return [];
    const label = [name, r.admin1, r.country].filter((p): p is string => Boolean(p && p.trim())).join(', ');
    return [{ id: String(id), name, label, lat, lon }];
  });

  return results;
}
