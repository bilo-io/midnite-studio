import { useQuery } from '@tanstack/react-query';

import { privacySwitchOn } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';

import { getCurrentWeather, searchLocations } from './weather-api';
import { locationKey, type WeatherLocation, type WeatherUnit } from './weather-types';

/**
 * The global default (`app.tsx`) is `staleTime: Infinity`, which is wrong for
 * live data — the same trap `finance-queries.ts` documents, and it applies
 * verbatim here. Refresh on the order of 15 minutes, not 60 seconds: it is
 * weather.
 */
const CURRENT_WEATHER_REFRESH_MS = 15 * 60_000;
const SEARCH_STALE_MS = 5 * 60_000;

/**
 * Gated on the lock screen being open (`enabled`) — an ungated poll for a
 * surface nobody is looking at is exactly what Phase 36 Theme E was written
 * about, and this phase's own Theme F checks it.
 */
export function useCurrentWeather(
  location: WeatherLocation | null,
  unit: WeatherUnit,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['weather', 'current', location ? locationKey(location) : null, unit],
    queryFn: () => getCurrentWeather(location!, unit),
    enabled: enabled && location !== null,
    staleTime: CURRENT_WEATHER_REFRESH_MS,
    refetchInterval: CURRENT_WEATHER_REFRESH_MS,
    // A fetch failure renders nothing, not a broken widget — no retry storm.
    retry: false,
  });
}

/** Debounced by the caller, matching `useFinanceSearch`'s own contract. */
export function useLocationSearch(query: string) {
  const trimmed = query.trim();
  // Phase 115 Theme A: the geocoder is registered under the `weather` switch, so it stops with it.
  const allAutomaticOff = useUiStore((s) => s.egressAllAutomaticOff);
  const egressSwitches = useUiStore((s) => s.egressSwitches);
  const weatherOn = privacySwitchOn({ allAutomaticOff, switches: egressSwitches }, 'weather');
  return useQuery({
    queryKey: ['weather', 'search', trimmed],
    queryFn: () => searchLocations(trimmed),
    enabled: trimmed.length >= 2 && weatherOn,
    staleTime: SEARCH_STALE_MS,
  });
}
