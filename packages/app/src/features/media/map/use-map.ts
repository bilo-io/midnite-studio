import type { MapCacheRequest, MapCacheStatus, MapProjectFile, MapProjectGetResult, MapProjectPatch, MapSourceStatus } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { bridge } from '../../../services/bridge';
import { MEDIA_KEYS } from '../use-media';
import type { BaseStyles, MapStyleSpec } from './map-style';

/**
 * Media ▸ Maps' data (Phase 108 Theme A). Keys sit under `MEDIA_KEYS.tab(repoId, 'map')`, so the same
 * `mediaChanged` ping that refreshes every Media tab refreshes this one.
 */
export const mapKey = (repoId: string, project: string) => [...MEDIA_KEYS.tab(repoId, 'map'), 'project', project] as const;

export function useMapProject(repoId: string, project: string) {
  return useQuery<MapProjectGetResult>({
    queryKey: mapKey(repoId, project),
    retry: false,
    // The map owns its viewport while it is open; only a project switch re-reads it.
    staleTime: Infinity,
    queryFn: async () => {
      const api = bridge()?.media.map;
      if (!api) throw new Error('Maps are unavailable without the desktop bridge.');
      const result = await api.get({ repoId, project });
      if (!result.ok) throw new Error(result.kind === 'error' ? result.message : 'Could not read map.json.');
      return result.value;
    },
  });
}

/** Everything but the 750 ms debounce lives here so a pan never writes on every frame. */
export const SAVE_DEBOUNCE_MS = 750;

/**
 * Debounced `setView`: `save(patch)` merges into one pending patch and writes it 750 ms after the last
 * call; `flush()` writes at once, and runs on unmount so the last viewport is never lost.
 */
export function useSaveMapView(repoId: string, project: string) {
  const pending = useRef<MapProjectPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = useRef({ repoId, project });
  target.current = { repoId, project };

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    void bridge()?.media.map.setView({ ...target.current, patch });
  }, []);

  const save = useCallback(
    (patch: MapProjectPatch) => {
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // A project switch writes what was pending for the old one, not the new one.
  useEffect(() => flush, [flush, repoId, project]);
  return { save, flush };
}

export const MAP_SOURCES_KEY = ['map', 'sources'] as const;

/** Whether each catalogue source is usable (a keyed one without a key is not). Never carries a key. */
export function useMapSources() {
  return useQuery<MapSourceStatus[]>({
    queryKey: MAP_SOURCES_KEY,
    staleTime: 0,
    queryFn: async () => (await bridge()?.media.map.sources())?.sources ?? [],
  });
}

const BASE_STYLE_NAMES = ['liberty', 'positron'] as const;

/**
 * Liberty and Positron, fetched through `mstudio-tile:` — main has already rewritten every URL in
 * them, so this is the only network access the renderer makes for a map and it never leaves the app.
 */
export function useBaseStyles(reloadKey = 0) {
  return useQuery<BaseStyles>({
    queryKey: ['map', 'base-styles', reloadKey],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const [liberty, positron] = await Promise.all(
        BASE_STYLE_NAMES.map(async (name) => {
          const response = await fetch(`mstudio-tile://openfreemap/style/${name}`);
          if (!response.ok) throw new Error(`The ${name} style failed to load (HTTP ${response.status}).`);
          return (await response.json()) as MapStyleSpec;
        }),
      );
      return { liberty: liberty!, positron: positron! };
    },
  });
}

export const MAP_CACHE_KEY = ['map', 'cache'] as const;

/** The tile cache readout and its three operations. */
export function useMapCache() {
  const client = useQueryClient();
  const status = useQuery<MapCacheStatus | null>({
    queryKey: MAP_CACHE_KEY,
    staleTime: 0,
    queryFn: async () => {
      const result = await bridge()?.media.map.cache({ op: 'status' });
      return result?.ok ? result.value : null;
    },
  });
  const run = useMutation({
    mutationFn: async (req: MapCacheRequest) => {
      const result = await bridge()?.media.map.cache(req);
      if (!result?.ok) throw new Error(result && result.kind === 'error' ? result.message : 'Maps are unavailable without the desktop bridge.');
      return result.value;
    },
    onSuccess: (value) => client.setQueryData(MAP_CACHE_KEY, value),
  });
  return { status, run };
}

export type { MapProjectFile };
