import { type MapFrame, type MapProjectFile, type MapProjectPatch } from '@midnite/studio-shared';
import { useCallback, useMemo, useState } from 'react';

import { defaultFrame, type LonLat } from './map-frame';

export type Terrain3d = { on: boolean; exaggeration: number };
export type ElevationRange = { min: number; max: number } | null;

/**
 * Phase 108 Theme C's tab-level state: the 3D preview and the capture frame. Shared by the canvas (which
 * draws them) and the detail pane (which shows the readout), so it lives above both. Local overrides sit on
 * top of the saved `map.json` and every change is written back through the debounced `save`.
 */
export function useMapFraming(opts: { map: MapProjectFile | undefined; save: (patch: MapProjectPatch) => void; widthPx?: number }) {
  const { map, save, widthPx = 800 } = opts;
  const [t3d, setT3d] = useState<Terrain3d | null>(null);
  const [frameState, setFrameState] = useState<MapFrame | null>(null);
  const [frameOn, setFrameOn] = useState<boolean | null>(null);
  const [elevation, setElevation] = useState<ElevationRange>(null);

  const terrain3d: Terrain3d = useMemo(() => t3d ?? map?.terrain3d ?? { on: false, exaggeration: 1.5 }, [t3d, map?.terrain3d]);
  const frame: MapFrame | null = frameState ?? map?.frame ?? null;
  const visible = frameOn ?? Boolean(map?.frame);

  const setTerrain3d = useCallback(
    (next: Terrain3d) => {
      setT3d(next);
      save({ terrain3d: next });
      if (!next.on) setElevation(null);
    },
    [save],
  );
  const toggle3d = useCallback(() => setTerrain3d({ ...terrain3d, on: !terrain3d.on }), [setTerrain3d, terrain3d]);

  const setFrame = useCallback(
    (next: MapFrame) => {
      setFrameState(next);
      save({ frame: next });
    },
    [save],
  );
  const moveFrame = useCallback((next: { center: LonLat; sideM: number }) => frame && setFrame({ ...frame, ...next }), [frame, setFrame]);

  /** `F`: the first time, a default frame centred on the view; after that, show/hide the stored one. */
  const toggleFrame = useCallback(
    (view: { center: LonLat; zoom: number }) => {
      if (!visible && !frame) setFrame(defaultFrame(view, widthPx));
      setFrameOn(!visible);
    },
    [visible, frame, setFrame, widthPx],
  );

  return { terrain3d, setTerrain3d, toggle3d, frame, visible, setFrame, moveFrame, toggleFrame, elevation, setElevation };
}
