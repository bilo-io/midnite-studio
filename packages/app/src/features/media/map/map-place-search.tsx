import { useEffect, useRef, useState } from 'react';
import { LuSearch } from 'react-icons/lu';

import { searchLocations } from '../../geo/geocode';
import type { WeatherLocation } from '../../weather/weather-types';
import { useMapPlaceStore } from './map-place-store';

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_CHARS = 2;
const PLACE_ZOOM = 12;

const describe = (p: WeatherLocation): string => [p.name, p.admin1, p.country].filter(Boolean).join(', ');

/**
 * Place search over the Open-Meteo geocoder (Phase 108 Theme G): 300 ms debounce, two characters
 * minimum, up to eight results, Enter flies to the first. The stale response of an earlier keystroke is
 * dropped, so a slow answer can never overwrite a newer list.
 */
export function MapPlaceSearch({ onPick }: { onPick: (center: [number, number], zoom: number) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeatherLocation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const setPlace = useMapPlaceStore((s) => s.setPlace);

  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      seq.current += 1;
      setResults(null);
      setFailed(false);
      return;
    }
    const mine = (seq.current += 1);
    const timer = setTimeout(() => {
      searchLocations(q).then(
        (found) => {
          if (seq.current !== mine) return;
          setResults(found);
          setFailed(false);
        },
        () => {
          if (seq.current !== mine) return;
          setResults(null);
          setFailed(true);
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const pick = (p: WeatherLocation) => {
    const center: [number, number] = [p.longitude, p.latitude];
    setPlace({ name: describe(p), center });
    onPick(center, PLACE_ZOOM);
    setQuery(describe(p));
    setOpen(false);
  };

  return (
    <div className="relative w-60" data-testid="map-place-search">
      <label className="flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-1 text-xs shadow-sm backdrop-blur-sm">
        <LuSearch aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search places"
          placeholder="Search places"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results?.[0]) {
              e.preventDefault();
              pick(results[0]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </label>
      {open && query.trim().length >= SEARCH_MIN_CHARS && (failed || results) ? (
        <ul aria-label="Places" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-xs shadow-md">
          {failed ? <li className="px-2 py-1 text-muted-foreground">Place search needs a network connection.</li> : null}
          {!failed && results?.length === 0 ? <li className="px-2 py-1 text-muted-foreground">No places match.</li> : null}
          {results?.map((p) => (
            <li key={`${p.latitude},${p.longitude},${p.name}`}>
              <button type="button" onClick={() => pick(p)} className="block w-full truncate rounded px-2 py-1 text-left hover:bg-accent">
                {describe(p)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
