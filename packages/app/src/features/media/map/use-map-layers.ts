import {
  DEFAULT_MAP_LAYER,
  DEFAULT_MAP_LAYER_COLOR,
  emptyLayer,
  mapLayerNameOf,
  mapLayerPath,
  parseLayer,
  stringifyLayer,
  type MapLayerFeature,
  type MapLayerFile,
  type MapProjectFile,
  type MapProjectPatch,
} from '@midnite/studio-shared';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { bridge } from '../../../services/bridge';
import { MEDIA_KEYS, useMediaFiles, useMediaMutations } from '../use-media';
import { uniqueLayerName, type LayerView } from './map-layers';

/** Edits reach disk this long after the last one — a drag is one write, not sixty. */
export const LAYER_WRITE_DEBOUNCE_MS = 500;

type LayerStyle = { color: string; visible: boolean };
type Meta = { order: string[]; style: Record<string, LayerStyle> };

export type MapLayers = ReturnType<typeof useMapLayers>;

/**
 * Phase 108 Theme H: a map project's layers. Each is `layers/<name>.geojson`, read and written through
 * the generic media file channels (no map-specific IPC). Local edits sit on top of what was last read and
 * are written 500 ms after the last one; colour, visibility and order are `map.json`'s (`layerStyle`,
 * `layerOrder`) so toggling never rewrites a GeoJSON. A file that does not parse is listed in an error
 * state, not drawn and never written over.
 */
export function useMapLayers(opts: { repoId: string; project: string; map: MapProjectFile | undefined; save: (patch: MapProjectPatch) => void }) {
  const { repoId, project, map, save } = opts;
  const client = useQueryClient();
  const mutations = useMediaMutations(repoId, 'map');
  const files = useMediaFiles(repoId, 'map', project);

  const [meta, setMeta] = useState<Meta | null>(null);
  const order = useMemo(() => meta?.order ?? map?.layerOrder ?? [], [meta, map?.layerOrder]);
  const styles = useMemo(() => meta?.style ?? map?.layerStyle ?? {}, [meta, map?.layerStyle]);
  const [edits, setEdits] = useState<Record<string, MapLayerFile>>({});
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const [active, setActive] = useState<string | null>(null);

  const diskNames = useMemo(() => (files.data ?? []).map((f) => mapLayerNameOf(f.path)).filter((n): n is string => n !== null), [files.data]);
  const names = useMemo(() => {
    const all = [...new Set([...diskNames, ...Object.keys(edits)])];
    const ranked = order.filter((n) => all.includes(n));
    return [...ranked, ...all.filter((n) => !ranked.includes(n)).sort((a, b) => a.localeCompare(b))];
  }, [diskNames, edits, order]);

  const reads = useQueries({
    queries: diskNames.map((name) => ({
      queryKey: MEDIA_KEYS.file(repoId, 'map', project, mapLayerPath(name)),
      retry: false,
      queryFn: async (): Promise<string> => {
        const result = await bridge()?.media.file.read({ repoId, tab: 'map', project, path: mapLayerPath(name) });
        if (!result?.ok) throw new Error(result && result.kind === 'error' ? result.message : 'Layer unreadable.');
        return result.value;
      },
    })),
  });
  const textOf = useMemo(() => new Map(diskNames.map((n, i) => [n, reads[i]?.data] as const)), [diskNames, reads]);

  const layers: LayerView[] = useMemo(
    () =>
      names.map((name) => {
        const text = textOf.get(name);
        const parsed = edits[name] ?? (text === undefined ? emptyLayer() : parseLayer(text));
        const style = styles[name];
        return { name, fc: parsed, color: style?.color ?? DEFAULT_MAP_LAYER_COLOR, visible: style?.visible ?? true };
      }),
    [names, textOf, edits, styles],
  );
  const layersRef = useRef(layers);
  layersRef.current = layers;

  // --- debounced writes ---
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const writeNow = useCallback(
    async (name: string) => {
      const timer = timers.current.get(name);
      if (timer) clearTimeout(timer);
      timers.current.delete(name);
      const fc = editsRef.current[name];
      if (!fc) return;
      const result = await mutations.writeFile.mutateAsync({ project, path: mapLayerPath(name), content: stringifyLayer(fc) });
      if (!result.ok) return;
      await client.refetchQueries({ queryKey: MEDIA_KEYS.file(repoId, 'map', project, mapLayerPath(name)) });
      setEdits((cur) => {
        if (cur[name] !== fc) return cur;
        const { [name]: _written, ...rest } = cur;
        return rest;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the mutation object is unstable; its fn is not
    [client, repoId, project],
  );
  const schedule = useCallback(
    (name: string) => {
      const prev = timers.current.get(name);
      if (prev) clearTimeout(prev);
      timers.current.set(name, setTimeout(() => void writeNow(name), LAYER_WRITE_DEBOUNCE_MS));
    },
    [writeNow],
  );
  // Whatever is still waiting is written when the tab closes.
  useEffect(
    () => () => {
      for (const name of [...timers.current.keys()]) void writeNow(name);
    },
    [writeNow],
  );

  /** `null` for a layer whose file is not valid GeoJSON — edits to it are refused. */
  const editable = (name: string): MapLayerFile | null => layersRef.current.find((l) => l.name === name)?.fc ?? null;
  const commit = useCallback(
    (name: string, fc: MapLayerFile) => {
      setEdits((cur) => ({ ...cur, [name]: fc }));
      editsRef.current = { ...editsRef.current, [name]: fc };
      schedule(name);
    },
    [schedule],
  );

  const setMetaAndSave = (next: Meta) => {
    setMeta(next);
    save({ layerOrder: next.order, layerStyle: next.style });
  };
  const styleOf = (name: string): LayerStyle => styles[name] ?? { color: DEFAULT_MAP_LAYER_COLOR, visible: true };

  /** Where a new drawing goes: the active layer, else `drawings` (created on first use). */
  const targetName = (): string => (active && layersRef.current.some((l) => l.name === active && l.fc) ? active : DEFAULT_MAP_LAYER);

  return {
    layers,
    active,
    setActive,
    loading: files.isLoading,
    /** Adds a feature to the target layer; returns its layer name, or `null` when that layer's file is unreadable. */
    addFeature(feature: MapLayerFeature): string | null {
      const name = targetName();
      const fc = editable(name) ?? (layersRef.current.some((l) => l.name === name) ? null : emptyLayer());
      if (!fc) return null;
      if (!layersRef.current.some((l) => l.name === name)) setMetaAndSave({ order: [...order, name], style: { ...styles, [name]: styleOf(name) } });
      commit(name, { ...fc, features: [...fc.features, feature] });
      setActive(name);
      return name;
    },
    updateFeature(name: string, id: string, patch: (f: MapLayerFeature) => MapLayerFeature) {
      const fc = editable(name);
      if (!fc) return;
      commit(name, { ...fc, features: fc.features.map((f) => (String(f.id ?? '') === id ? patch(f) : f)) });
    },
    removeFeature(name: string, id: string) {
      const fc = editable(name);
      if (!fc) return;
      commit(name, { ...fc, features: fc.features.filter((f) => String(f.id ?? '') !== id) });
    },
    setStyle(name: string, patch: Partial<LayerStyle>) {
      setMetaAndSave({ order: names, style: { ...styles, [name]: { ...styleOf(name), ...patch } } });
    },
    /** Moves a layer up (`-1`) or down (`+1`) the draw order. */
    move(name: string, delta: -1 | 1) {
      const i = names.indexOf(name);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= names.length) return;
      const next = [...names];
      [next[i], next[j]] = [next[j]!, next[i]!];
      setMetaAndSave({ order: next, style: styles });
    },
    reorder(next: string[]) {
      setMetaAndSave({ order: next, style: styles });
    },
    async create(wanted: string, fc: MapLayerFile = emptyLayer()): Promise<string | null> {
      const name = uniqueLayerName(wanted, names);
      const result = await mutations.writeFile.mutateAsync({ project, path: mapLayerPath(name), content: stringifyLayer(fc) });
      if (!result.ok) return null;
      setMetaAndSave({ order: [...names, name], style: { ...styles, [name]: styleOf(name) } });
      setActive(name);
      return name;
    },
    async rename(name: string, to: string): Promise<boolean> {
      if (to === name) return true;
      if (names.includes(to)) return false;
      await writeNow(name);
      const result = await mutations.renameFile.mutateAsync({ project, path: mapLayerPath(name), to: mapLayerPath(to) });
      if (!result.ok) return false;
      const { [name]: moved, ...rest } = styles;
      setMetaAndSave({ order: names.map((n) => (n === name ? to : n)), style: { ...rest, [to]: moved ?? styleOf(name) } });
      if (active === name) setActive(to);
      return true;
    },
    async remove(name: string): Promise<void> {
      const timer = timers.current.get(name);
      if (timer) clearTimeout(timer);
      timers.current.delete(name);
      const result = await mutations.removeFile.mutateAsync({ project, path: mapLayerPath(name) });
      if (!result.ok) return;
      setEdits((cur) => {
        const { [name]: _gone, ...rest } = cur;
        return rest;
      });
      const { [name]: _style, ...rest } = styles;
      setMetaAndSave({ order: names.filter((n) => n !== name), style: rest });
      if (active === name) setActive(null);
    },
  };
}
