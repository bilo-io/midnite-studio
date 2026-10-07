import { MAP_FRAME_MAX_SIDE_M, MAP_FRAME_MIN_SIDE_M, map as geo, type MapFrame } from '@midnite/studio-shared';

/** Pure framing helpers for the capture frame (Phase 108 Theme C); no MapLibre in here. */

export type LonLat = [number, number];
export type FrameFeatures = { type: 'FeatureCollection'; features: Array<Record<string, unknown>> };

export const FRAME_RING_PER_SIDE = 16;

export const clampSide = (sideM: number): number => Math.max(MAP_FRAME_MIN_SIDE_M, Math.min(MAP_FRAME_MAX_SIDE_M, sideM));

/** The square as a projected outline (not a screen rectangle) plus its four corner handles. */
export function frameFeatures(frame: Pick<MapFrame, 'center' | 'sideM'>): { outline: FrameFeatures; handles: FrameFeatures } {
  const ring = geo.frameRing(frame.center, frame.sideM, FRAME_RING_PER_SIDE);
  const corners = [0, 1, 2, 3].map((i) => ring[i * FRAME_RING_PER_SIDE]!);
  return {
    outline: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }],
    },
    handles: {
      type: 'FeatureCollection',
      features: corners.map((c, i) => ({ type: 'Feature', properties: { corner: i }, geometry: { type: 'Point', coordinates: c } })),
    },
  };
}

/** Metres per CSS pixel at a zoom and latitude (MapLibre's 512 px world tile). */
export const metresPerPixel = (zoom: number, lat: number): number => (geo.MERCATOR_EQUATOR_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);

/** First-toggle frame: centred on the view, half the visible width, 1025 samples. */
export function defaultFrame(view: { center: LonLat; zoom: number }, widthPx: number): MapFrame {
  return { center: view.center, sideM: clampSide(Math.round(0.5 * widthPx * metresPerPixel(view.zoom, view.center[1]))), size: 1025 };
}

/** New side when a corner handle is dragged to `point`: the frame stays centred and square. */
export function resizedSide(center: LonLat, point: LonLat): number {
  const [x, z] = geo.toFrame(center, point);
  return clampSide(2 * Math.max(Math.abs(x), Math.abs(z)));
}

/** A `n × n` lattice inside the frame, for sampling the preview terrain. */
export function samplePoints(frame: Pick<MapFrame, 'center' | 'sideM'>, n = 9): LonLat[] {
  const out: LonLat[] = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = -frame.sideM / 2 + (i * frame.sideM) / (n - 1);
      const z = -frame.sideM / 2 + (j * frame.sideM) / (n - 1);
      out.push(geo.fromFrame(frame.center, [x, z]));
    }
  }
  return out;
}

export const formatSide = (sideM: number): string => (sideM < 1000 ? `${Math.round(sideM)} m` : `${(sideM / 1000).toFixed(2)} km`);
export const formatMPerPx = (sideM: number, size: number): string => {
  const v = sideM / (size - 1);
  return `${v < 10 ? v.toFixed(2) : v.toFixed(1)} m/px`;
};
