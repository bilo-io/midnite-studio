/**
 * Media ▸ Maps ▸ Capture for Terrain (Phase 108 Themes D–F) — the wire contract for a capture.
 *
 * A capture is `.midnite/media/map/<project>/captures/<name>/`: `heightmap.png` (16-bit, min→0,
 * max→65535), `heightmap.r32` (float32 metres), `heightmap.tif` (GeoTIFF) and `capture.json`, plus
 * `ATTRIBUTION.txt`. The geometry kernel is `shared/src/map/`.
 */
import { z } from 'zod';

import { MediaProjectNameSchema } from './media';
import { MapSourceIdSchema } from './media-map';
import { TERRAIN_RESOLUTIONS } from './media-terrain';

const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const TerrainSize = z.union(TERRAIN_RESOLUTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<129>, z.ZodLiteral<257>, ...z.ZodLiteral<number>[]]);

export const MAP_CAPTURE_MIN_SIDE_M = 16;
export const MAP_CAPTURE_MAX_SIDE_M = 65_536;
export const MAP_CAPTURE_BUSY = 'A capture is already running.';
export const MAP_CAPTURE_CANCELLED = 'Capture cancelled.';
export const MAP_CAPTURE_WORKER_CRASHED = 'The capture worker stopped unexpectedly.';

export const MapCaptureRequestSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  /** Chosen by the caller so it can cancel before the first progress event; generated when absent. */
  captureId: z.string().min(1).max(64).optional(),
  center: LonLat,
  sideM: z.number().min(MAP_CAPTURE_MIN_SIDE_M).max(MAP_CAPTURE_MAX_SIDE_M),
  size: TerrainSize,
  /** A place name for the capture folder; falls back to `lat_lon`. */
  place: z.string().max(80).optional(),
  /** Defaults to AWS Terrarium (the deepest keyless DEM). */
  demSource: MapSourceIdSchema.optional(),
});
export type MapCaptureRequest = z.infer<typeof MapCaptureRequestSchema>;

export const MapCaptureCancelRequestSchema = z.object({ captureId: z.string().min(1) });

export const MAP_CAPTURE_STAGES = ['plan', 'dem', 'satellite', 'roads', 'encode', 'handoff'] as const;
export type MapCaptureStage = (typeof MAP_CAPTURE_STAGES)[number];

export const MapCaptureProgressEventSchema = z.object({
  captureId: z.string(),
  stage: z.enum(MAP_CAPTURE_STAGES),
  fraction: z.number().min(0).max(1),
});
export type MapCaptureProgressEvent = z.infer<typeof MapCaptureProgressEventSchema>;

export const MapCaptureFileSchema = z
  .object({
    version: z.literal(1),
    name: z.string(),
    center: LonLat,
    sideM: z.number(),
    size: z.number().int(),
    mPerPx: z.number(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    heightMinM: z.number(),
    heightMaxM: z.number(),
    hasSea: z.boolean(),
    sources: z.object({
      dem: MapSourceIdSchema,
      satellite: MapSourceIdSchema.optional(),
      roads: z.string().optional(),
    }),
    demZoom: z.number().int(),
    satelliteZoom: z.number().int().optional(),
    attributions: z.array(z.string()),
    files: z.array(z.string()),
    missing: z.array(z.object({ slot: z.string(), reason: z.string() })),
    capturedAt: z.string(),
  })
  .passthrough();
export type MapCaptureFile = z.infer<typeof MapCaptureFileSchema>;

export const MapCaptureResultSchema = z.object({
  captureId: z.string(),
  /** The folder name under `captures/`. */
  name: z.string(),
  /** Project-relative, e.g. `captures/dunes-20261007-120000`. */
  dir: z.string(),
  capture: MapCaptureFileSchema,
});
export type MapCaptureResult = z.infer<typeof MapCaptureResultSchema>;

/** `<slug(place or lat_lon)>-YYYYMMDD-HHMMSS`, the `terrainFolderLabel` suffix shape. */
export function captureFolderName(
  req: { center: [number, number]; place?: string | undefined },
  at: Date,
): string {
  const slug = (req.place ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const fallback = `${req.center[1].toFixed(4)}_${req.center[0].toFixed(4)}`.replace(/-/g, 'm');
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp = `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}-${p(at.getUTCHours())}${p(at.getUTCMinutes())}${p(at.getUTCSeconds())}`;
  return `${slug || fallback}-${stamp}`;
}

/** Warnings shown below the frame readout; `blocking` ones disable Capture. */
export type CaptureWarning = { code: 'over-cap' | 'under-min' | 'dem-coarser'; message: string; blocking: boolean };

export function captureWarnings(
  frame: { sideM: number; center: [number, number] },
  size: number,
  dem: { nativeMPerPx: number },
): CaptureWarning[] {
  const out: CaptureWarning[] = [];
  if (frame.sideM > MAP_CAPTURE_MAX_SIDE_M)
    out.push({ code: 'over-cap', message: "Terrain's largest world is 65.5 km a side.", blocking: true });
  if (frame.sideM < MAP_CAPTURE_MIN_SIDE_M)
    out.push({ code: 'under-min', message: "Terrain's smallest world is 16 m a side.", blocking: true });
  const mPerPx = frame.sideM / (size - 1);
  if (mPerPx < dem.nativeMPerPx / 2)
    out.push({
      code: 'dem-coarser',
      message: `The elevation data is ~${Math.round(dem.nativeMPerPx)} m/px here; a smaller size gives the same detail.`,
      blocking: false,
    });
  return out;
}
