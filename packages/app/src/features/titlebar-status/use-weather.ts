import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { WeatherLocation, WeatherResponse } from './titlebar-status-types';
import { getWeather, locateByIp } from './weather-api';

const WEATHER_REFRESH_MS = 10 * 60_000;
const LANDING_COORDS_KEY = 'midnite.titlebar.weatherCoords';

function readCachedCoords(): WeatherLocation | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LANDING_COORDS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && typeof v.lat === 'number' && typeof v.lon === 'number') {
      return { lat: v.lat, lon: v.lon, ...(typeof v.label === 'string' ? { label: v.label } : {}) };
    }
  } catch {
    // ignore malformed storage
  }
  return null;
}

function saveCachedCoords(coords: WeatherLocation) {
  try {
    localStorage.setItem(LANDING_COORDS_KEY, JSON.stringify(coords));
  } catch {
    // ignore
  }
}

/** Ask browser geolocation once */
function askBrowser(): Promise<{ coords: WeatherLocation | null; denied: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ coords: null, denied: false });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ coords: { lat: pos.coords.latitude, lon: pos.coords.longitude }, denied: false }),
      (err) => resolve({ coords: null, denied: err.code === 1 }),
      { timeout: 8000 },
    );
  });
}

export function useWeather(locationOverride: WeatherLocation | null) {
  const [resolvedCoords, setResolvedCoords] = useState<WeatherLocation | null>(() => {
    if (locationOverride) return locationOverride;
    return readCachedCoords();
  });
  const [resolving, setResolving] = useState(!resolvedCoords);

  useEffect(() => {
    if (locationOverride) {
      setResolvedCoords(locationOverride);
      setResolving(false);
      saveCachedCoords(locationOverride);
      return;
    }

    let cancelled = false;
    setResolving(true);

    void (async () => {
      // 1. Try browser geolocation
      const { coords: browserCoords } = await askBrowser();
      if (cancelled) return;
      if (browserCoords) {
        setResolvedCoords(browserCoords);
        saveCachedCoords(browserCoords);
        setResolving(false);
        return;
      }

      // 2. Try IP geolocation fallback
      try {
        const ipLocation = await locateByIp();
        if (cancelled) return;
        const coords: WeatherLocation = {
          lat: ipLocation.lat,
          lon: ipLocation.lon,
          ...(ipLocation.label ? { label: ipLocation.label } : {}),
        };
        setResolvedCoords(coords);
        saveCachedCoords(coords);
      } catch {
        // Fallback default (e.g. London or null)
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locationOverride]);

  const query = useQuery<WeatherResponse | null>({
    queryKey: ['weather', resolvedCoords?.lat, resolvedCoords?.lon],
    queryFn: async () => {
      if (!resolvedCoords) return null;
      return getWeather(resolvedCoords.lat, resolvedCoords.lon);
    },
    enabled: Boolean(resolvedCoords),
    refetchInterval: WEATHER_REFRESH_MS,
    staleTime: WEATHER_REFRESH_MS / 2,
  });

  return {
    ...query,
    coords: resolvedCoords,
    resolving,
  };
}
