import { useEffect, useState } from 'react';
import {
  LuDroplets,
  LuLocate,
  LuMapPin,
  LuRefreshCw,
  LuSearch,
} from 'react-icons/lu';

import { Spinner } from '../../../components/skeleton';
import { useTitlebarStatusStore } from '../titlebar-status-store';
import type {
  WeatherGeocodeResult,
  WeatherUnits,
} from '../titlebar-status-types';
import { useWeather } from '../use-weather';
import { geocodePlace } from '../weather-api';
import { deg, describeWeatherCode, temp } from '../weather-format';

export function WeatherSection() {
  const weatherUnits = useTitlebarStatusStore((s) => s.weatherUnits);
  const weatherLocation = useTitlebarStatusStore((s) => s.weatherLocation);
  const setWeatherUnits = useTitlebarStatusStore((s) => s.setWeatherUnits);
  const setWeatherLocation = useTitlebarStatusStore((s) => s.setWeatherLocation);

  const { data, isLoading, isError, refetch, isFetching, coords } = useWeather(weatherLocation);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WeatherGeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await geocodePlace(searchQuery.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { icon: WeatherIcon, label: weatherLabel } = describeWeatherCode(
    data?.current.weatherCode ?? 0,
  );

  return (
    <div className="flex flex-col rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <WeatherIcon className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[140px] truncate">
            {coords?.label || weatherLocation?.label || 'Weather'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border border-border/60 p-0.5 text-[10px]">
            {(['c', 'f'] as const).map((u: WeatherUnits) => (
              <button
                key={u}
                type="button"
                onClick={() => setWeatherUnits(u)}
                className={`rounded px-1.5 py-0.5 uppercase transition-colors ${
                  weatherUnits === u
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                °{u}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSearching(!searching)}
            title={searching ? 'Close search' : 'Search location'}
            className={`rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
              searching ? 'bg-accent text-accent-foreground' : ''
            }`}
          >
            <LuSearch className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh weather"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {isFetching ? (
              <Spinner size="sm" tone="inherit" />
            ) : (
              <LuRefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {searching ? (
        <div className="flex flex-col gap-2 py-1">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-2 py-1 focus-within:ring-1 focus-within:ring-primary">
            <LuSearch className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city, e.g. London, Tokyo..."
              className="flex-1 bg-transparent text-xs outline-none"
            />
          </div>

          {weatherLocation && (
            <button
              type="button"
              onClick={() => {
                setWeatherLocation(null);
                setSearching(false);
                setSearchQuery('');
              }}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-primary hover:bg-accent"
            >
              <LuLocate className="h-3.5 w-3.5" />
              <span>Use automatic geolocation / IP</span>
            </button>
          )}

          {isSearching && <p className="text-[11px] text-muted-foreground">Searching locations…</p>}

          {searchResults.length > 0 && (
            <div className="max-h-36 overflow-y-auto rounded border border-border/40 divide-y divide-border/20">
              {searchResults.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => {
                    setWeatherLocation({ lat: hit.lat, lon: hit.lon, label: hit.label });
                    setSearching(false);
                    setSearchQuery('');
                  }}
                  className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                >
                  <LuMapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{hit.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : isLoading && !data ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          Loading weather…
        </div>
      ) : isError && !data ? (
        <div className="flex flex-col items-center justify-center py-4 text-center text-xs text-destructive">
          <p>Weather unavailable</p>
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="mt-1 text-[11px] text-primary underline"
          >
            Select location manually
          </button>
        </div>
      ) : data ? (
        <div className="flex flex-col items-center justify-center py-2">
          <div className="flex items-center gap-3">
            <WeatherIcon className="h-9 w-9 text-foreground" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {temp(data.current.temperatureC, weatherUnits)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{weatherLabel}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums font-medium">
              {deg(data.today.lowC, weatherUnits)} – {deg(data.today.highC, weatherUnits)}
            </span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1 tabular-nums font-medium">
              <LuDroplets className="h-3.5 w-3.5 text-sky-400" />
              {data.today.precipitationProbability}% precip
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
