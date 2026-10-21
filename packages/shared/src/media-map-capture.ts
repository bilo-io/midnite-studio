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

/** Roads are captured only for frames up to this side (Decision 17); a bigger Overpass bbox times out. */
export const MAP_ROADS_MAX_SIDE_M = 25_000;
export const MAP_ROADS_TOO_LARGE = 'Roads are captured for frames up to 25 km a side.';
export const MAP_ROADS_BUSY = "OpenStreetMap's Overpass server is busy — try again in a minute.";
export const MAP_ROADS_NONE = 'No roads in this area.';
/** Buildings are captured for frames up to this side; a city-sized bbox is tens of MB of OSM ways. */
export const MAP_BUILDINGS_MAX_SIDE_M = 10_000;
export const MAP_BUILDINGS_TOO_LARGE = 'Buildings are captured for frames up to 10 km a side.';
export const MAP_BUILDINGS_NONE = 'No buildings in this area.';
export const OSM_ATTRIBUTION_TEXT = '© OpenStreetMap contributors (ODbL) — via the Overpass API';

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
  /** Theme E: capture a satellite image at Terrain's texture size. Default on. */
  satellite: z.boolean().optional(),
  /** Theme E: capture the OSM road graph and mask (frames up to 25 km a side). Default on. */
  roads: z.boolean().optional(),
  /** Capture OSM building footprints with heights (frames up to 10 km a side). Default on. */
  buildings: z.boolean().optional(),
  /** Defaults to MapTiler when its key is set, else EOX Sentinel-2 cloudless 2016. */
  satelliteSource: MapSourceIdSchema.optional(),
  /** Theme F: create a Terrain from the capture (main calls the terrain service directly). */
  handoff: z.boolean().optional(),
  /** With `handoff`: also start the terrain build ("Capture and build"). */
  build: z.boolean().optional(),
});
export type MapCaptureRequest = z.infer<typeof MapCaptureRequestSchema>;

/** OSM highway classes a capture keeps; `*_link` folds into its parent, foot/cycle ways into `path`. */
export const MAP_ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'track', 'path'] as const;
export type MapRoadClass = (typeof MAP_ROAD_CLASSES)[number];

/**
 * `roads.graph.json` (Theme E writes it, Theme F hands it to Terrain): the real OSM road graph in
 * Terrain's centred frame — `x` east, `z` south, metres.
 */
export const MapRoadGraphFileSchema = z.object({
  version: z.literal(1),
  worldSize: z.number().positive(),
  nodes: z.array(z.object({ id: z.number().int().nonnegative(), p: z.tuple([z.number(), z.number()]) })),
  edges: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      a: z.number().int().nonnegative(),
      b: z.number().int().nonnegative(),
      points: z.array(z.tuple([z.number(), z.number()])),
      cls: z.enum(MAP_ROAD_CLASSES),
      name: z.string().optional(),
      lanes: z.number().int().positive().optional(),
      widthM: z.number().positive(),
      osmWayId: z.number().int().optional(),
    }),
  ),
});
export type MapRoadGraphFile = z.infer<typeof MapRoadGraphFileSchema>;

/**
 * `buildings.json` (a capture writes it, the hand-off gives it to Terrain as `inputs/buildings.footprints.json`):
 * OSM building footprints in Terrain's centred frame — `x` east, `z` south, metres. `heightM` is the roof
 * above ground where OSM states or implies it; Terrain picks a height for the rest.
 */
export const MapBuildingsFileSchema = z.object({
  version: z.literal(1),
  worldSize: z.number().positive(),
  buildings: z.array(
    z.object({
      id: z.number().int(),
      polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
      heightM: z.number().positive().optional(),
      minHeightM: z.number().positive().optional(),
    }),
  ),
});
export type MapBuildingsFile = z.infer<typeof MapBuildingsFileSchema>;

export const MapCaptureCancelRequestSchema = z.object({ captureId: z.string().min(1) });

export const MAP_CAPTURE_STAGES = ['plan', 'dem', 'satellite', 'roads', 'buildings', 'encode', 'handoff'] as const;
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
      buildings: z.string().optional(),
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
  /** Set when the request asked for a hand-off and it succeeded. */
  terrain: z.object({ project: z.string(), terrain: z.string() }).optional(),
});
export type MapCaptureResult = z.infer<typeof MapCaptureResultSchema>;

/** The side of the satellite and roads layers (Decision 15): Terrain's `textureSize` for this capture. */
export function captureTextureSize(size: number): 2048 | 4096 {
  return size <= 2049 ? 2048 : 4096;
}

/** Fraction of DEM samples at or below 0 m that makes a frame "contain sea" (≥ 1 %). */
export const MAP_CAPTURE_SEA_FRACTION = 0.01;

/**
 * The terrain settings a capture implies (Phase 108 Theme F): world size and height range in metres,
 * the grid at the output size, the texture size, `seaLevel: 0` when the frame has sea, no pre-smooth
 * (the heightmap is 16-bit), and a `geo` block recording where it came from. `alignment` stays at
 * Terrain's identity default, so it is deliberately absent from the patch.
 */
export function handoffSpec(
  capture: MapCaptureFile,
  origin: { repoId?: string; project: string; name?: string },
): Record<string, unknown> {
  const hi = capture.heightMaxM - capture.heightMinM < 0.5 ? capture.heightMinM + 1 : capture.heightMaxM;
  return {
    ...(origin.name ? { name: origin.name } : {}),
    worldSize: capture.sideM,
    heightRange: [capture.heightMinM, hi],
    resolution: capture.size,
    textureSize: captureTextureSize(capture.size),
    ...(capture.hasSea ? { seaLevel: 0 } : {}),
    preSmooth: 0,
    geo: {
      center: capture.center,
      bbox: capture.bbox,
      sideM: capture.sideM,
      capture: { ...(origin.repoId ? { repoId: origin.repoId } : {}), project: origin.project, name: capture.name },
      attributions: capture.attributions,
      capturedAt: capture.capturedAt,
    },
  };
}

/** The terrain's name for a capture: the place, else `"<lat>, <lon>"` at 3 dp. */
export function captureTerrainName(req: { center: [number, number]; place?: string | undefined }): string {
  return req.place?.trim() || `${req.center[1].toFixed(3)}, ${req.center[0].toFixed(3)}`;
}

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
export type CaptureWarning = { code: 'over-cap' | 'under-min' | 'dem-coarser' | 'roads-skipped' | 'buildings-skipped'; message: string; blocking: boolean };

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
  if (frame.sideM > MAP_ROADS_MAX_SIDE_M && frame.sideM <= MAP_CAPTURE_MAX_SIDE_M)
    out.push({ code: 'roads-skipped', message: MAP_ROADS_TOO_LARGE, blocking: false });
  if (frame.sideM > MAP_BUILDINGS_MAX_SIDE_M && frame.sideM <= MAP_CAPTURE_MAX_SIDE_M)
    out.push({ code: 'buildings-skipped', message: MAP_BUILDINGS_TOO_LARGE, blocking: false });
  return out;
}
