import type { MapLayerFeature, MapProjectFile, MapProjectPatch } from '@midnite/studio-shared';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import { useUiStore } from '../../../store/ui-store';
import { draftData, drawingsData, featureId, selKey, splitSelKey } from './map-layers';
import type { LonLat } from './map-frame';
import { canFinish, draftShape, featureFromDraft, initialToolState, mapToolReducer, type MapTool } from './map-tools';
import { useMapLayers } from './use-map-layers';

export type MapDrawing = ReturnType<typeof useMapDrawing>;

/**
 * Phase 108 Themes G and H at the tab level: the tool reducer, the layers, and the selection, in one
 * place so the canvas (which draws them), the explorer (which lists layers) and the detail pane (which
 * edits the selection) share a single state.
 */
export function useMapDrawing(opts: { repoId: string; project: string; map: MapProjectFile | undefined; save: (patch: MapProjectPatch) => void }) {
  const units = useUiStore((s) => s.mapUnits);
  const [state, dispatch] = useReducer(mapToolReducer, initialToolState);
  const layers = useMapLayers(opts);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const featureCount = layers.layers.reduce((n, l) => n + (l.fc?.features.length ?? 0), 0);
  const add = layers.addFeature;

  const place = useCallback(
    (shape: NonNullable<ReturnType<typeof draftShape>>) => {
      const made = featureFromDraft(shape, featureCount + 1);
      if ('error' in made) return setNotice(made.error);
      const layer = add(made.feature);
      if (!layer) return setNotice('That layer is not valid GeoJSON — fix the file or pick another layer.');
      setNotice(null);
      setSelected([selKey(layer, featureId(made.feature))]);
      dispatch({ type: 'reset' });
    },
    [add, featureCount],
  );

  const finish = useCallback(() => {
    const shape = draftShape(state);
    if (shape) place(shape);
  }, [state, place]);

  // A circle is finished by its second click; nothing else needs Enter.
  useEffect(() => {
    if (state.tool === 'circle' && state.radiusM !== null) finish();
  }, [state, finish]);

  const click = useCallback(
    (point: LonLat) => {
      setNotice(null);
      if (state.tool === 'pin') return place({ kind: 'pin', point });
      dispatch({ type: 'click', point });
    },
    [state.tool, place],
  );

  const selectTool = useCallback((tool: MapTool) => {
    setNotice(null);
    setSelected([]);
    dispatch({ type: 'select', tool });
  }, []);

  /** Esc: cancel the in-progress shape, then the tool, then the selection. */
  const cancel = useCallback(() => {
    setNotice(null);
    if (state.tool === 'pan') return setSelected([]);
    dispatch({ type: 'cancel' });
  }, [state.tool]);

  const pickFeature = useCallback(
    (fid: string | null, shift: boolean) => {
      if (fid === null) return shift ? undefined : setSelected([]);
      setSelected((cur) => (shift ? (cur.includes(fid) ? cur.filter((k) => k !== fid) : [...cur.slice(-1), fid]) : [fid]));
      layers.setActive(splitSelKey(fid).layer);
    },
    [layers],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const drawings = useMemo(() => drawingsData(layers.layers, selectedSet), [layers.layers, selectedSet]);
  const draft = useMemo(() => draftData(state), [state]);

  const featureOf = useCallback(
    (key: string): MapLayerFeature | undefined => {
      const { layer, id } = splitSelKey(key);
      return layers.layers.find((l) => l.name === layer)?.fc?.features.find((f) => featureId(f) === id);
    },
    [layers.layers],
  );

  return {
    units,
    state,
    tool: state.tool,
    layers,
    selected,
    selectedFeatures: selected.map((k) => ({ key: k, ...splitSelKey(k), feature: featureOf(k) })).filter((s) => s.feature) as Array<{ key: string; layer: string; id: string; feature: MapLayerFeature }>,
    notice,
    drawings,
    draft,
    canFinish: canFinish(state),
    selectTool,
    click,
    finish,
    cancel,
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    moveVertex: useCallback((index: number, point: LonLat) => dispatch({ type: 'move', index, point }), []),
    pickFeature,
    clearSelection: useCallback(() => setSelected([]), []),
  };
}
