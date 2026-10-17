import { create } from 'zustand';

/**
 * "Show on map" from a terrain a capture made (Phase 108 Theme F): Terrain asks, Maps answers by
 * opening that project and framing the square. Not persisted — a request lives only until the Maps
 * tab consumes it; `n` makes a repeat request for the same capture still a change.
 *
 * Terrain never imports this: its host's `showOnMap` does (Phase 113 Theme S) — the composing app posts
 * the request here and brings its Maps tab up, which is the one thing a feature cannot do for itself.
 */
export type MapFocusRequest = {
  project: string;
  /** The capture's folder name under `captures/`. */
  name: string;
  center: [number, number];
  sideM: number;
};

type FocusStore = {
  request: (MapFocusRequest & { n: number }) | null;
  focus: (request: MapFocusRequest) => void;
  clear: () => void;
};

export const useMapFocus = create<FocusStore>((set, get) => ({
  request: null,
  focus: (request) => set({ request: { ...request, n: (get().request?.n ?? 0) + 1 } }),
  clear: () => set({ request: null }),
}));

/** A zoom (MapLibre, 512 px tiles) that fits a square of `sideM` metres in roughly 500 px at `lat`. */
export function zoomForSide(lat: number, sideM: number): number {
  const circumference = 40_075_016.686;
  const z = Math.log2((circumference * Math.cos((lat * Math.PI) / 180) * 500) / (512 * sideM));
  return Math.min(22, Math.max(0, Math.round(z * 10) / 10));
}
