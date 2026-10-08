/**
 * Media ▸ Maps over MCP (Phase 108 Theme I) — the tools an agent uses to look at the world and, once
 * the user has allowed it, to point the Maps tab somewhere or capture a square of it for Terrain.
 * Registered in `MCP_TOOLS` (`mcp.ts`).
 *
 * `map_list` and `map_measure` change nothing and answer whenever the server is on. `map_goto` moves
 * the user's view and `map_capture_terrain` writes files and creates a terrain, so both sit behind
 * `Settings ▸ MCP ▸ Let agents capture maps` (`allowMaps`, off by default) — Decision 19.
 *
 * `map_capture_terrain` runs the very capture + hand-off path the Maps tab's button runs
 * (`capture-service.ts`), so whatever that path learns to capture, this tool captures too.
 *
 * **Connecting a session of your own.** Enable Settings ▸ MCP, turn on "Let agents capture maps",
 * then `claude mcp add midnite -- node <shim path from Settings ▸ MCP>`.
 */
import { z } from 'zod';

import { MediaProjectNameSchema } from './media';
import { MAP_CAPTURE_MAX_SIDE_M, MAP_CAPTURE_MIN_SIDE_M, MapCaptureFileSchema } from './media-map-capture';
import { TERRAIN_RESOLUTIONS } from './media-terrain';

/** Ids of the tools, in the order an agent meets them. */
export const MAP_MCP_TOOL_IDS = ['map_list', 'map_measure', 'map_goto', 'map_capture_terrain'] as const;
export type MapMcpToolId = (typeof MAP_MCP_TOOL_IDS)[number];
export const isMapMcpToolId = (value: string): value is MapMcpToolId => (MAP_MCP_TOOL_IDS as readonly string[]).includes(value);

/** Tools that move the user's view or write files — gated by `Settings ▸ MCP ▸ Let agents capture maps`. */
export const MAP_MCP_WRITE_TOOL_IDS: readonly MapMcpToolId[] = ['map_goto', 'map_capture_terrain'];

/** A capture fetches hundreds of tiles and may build a terrain: it outlasts the shim's default timeout. */
export const MAP_SLOW_TOOL_IDS: readonly MapMcpToolId[] = ['map_capture_terrain'];
export const isMapSlowToolId = (value: string): boolean => (MAP_SLOW_TOOL_IDS as readonly string[]).includes(value);
export const MAP_CALL_TIMEOUT_MS = 300_000;

/** The exact refusal the write tools answer with while `McpSettings.allowMaps` is off. */
export const MAPS_OFF_MESSAGE = 'Map capture is off — Settings ▸ MCP ▸ Let agents capture maps';

const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const TerrainSize = z.union(TERRAIN_RESOLUTIONS.map((n) => z.literal(n)) as [z.ZodLiteral<129>, z.ZodLiteral<257>, ...z.ZodLiteral<number>[]]);

// --- map_list -----------------------------------------------------------------

export const MapListInputSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema.optional(),
});
export const MapListResultSchema = z.object({
  projects: z.array(
    z.object({
      name: z.string(),
      captures: z.array(
        z.object({
          /** The folder under `captures/`. */
          name: z.string(),
          center: LonLat,
          sideM: z.number(),
          size: z.number().int(),
          heightMinM: z.number(),
          heightMaxM: z.number(),
          capturedAt: z.string(),
          /** Which layers the capture holds: `heightmap`, `satellite`, `roads`. */
          layers: z.array(z.string()),
        }),
      ),
      /** GeoJSON layers under `layers/`, with how many features each holds. */
      layers: z.array(z.object({ name: z.string(), features: z.number().int().min(0) })),
    }),
  ),
});

// --- map_measure --------------------------------------------------------------

export const MAP_MEASURE_MAX_POINTS = 500;
export const MapMeasureInputSchema = z.object({
  /** A path: the distance of each leg and the total, on the WGS84 ellipsoid. */
  points: z.array(LonLat).min(2).max(MAP_MEASURE_MAX_POINTS).optional(),
  /** A circle: its centre … */
  center: LonLat.optional(),
  /** … and radius in metres (1 m – 2 000 km). */
  radiusM: z.number().min(1).max(2_000_000).optional(),
});
export const MapMeasureResultSchema = z.object({
  legsM: z.array(z.number()).optional(),
  totalM: z.number().optional(),
  /** A closed ring of lon/lat vertices, each exactly `radiusM` from the centre. */
  ring: z.array(LonLat).optional(),
  circumferenceM: z.number().optional(),
  areaM2: z.number().optional(),
});

// --- map_goto -----------------------------------------------------------------

export const MapGotoInputSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema.optional(),
  /** A place name, looked up with the same geocoder the Maps tab's search box uses. */
  place: z.string().trim().min(1).max(200).optional(),
  /** Or an explicit `[lon, lat]`. */
  center: LonLat.optional(),
  zoom: z.number().min(0).max(22).optional(),
});
export const MapGotoResultSchema = z.object({
  opened: z.literal(true),
  center: LonLat,
  zoom: z.number(),
  /** The place the name resolved to, when `place` was given. */
  place: z.string().optional(),
});

/** What main broadcasts so the Maps tab flies to a place (`mstudio:media:map-open`). */
export const MapOpenEventSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  center: LonLat,
  zoom: z.number().min(0).max(22),
  place: z.string().optional(),
});
export type MapOpenEvent = z.infer<typeof MapOpenEventSchema>;

// --- map_capture_terrain ------------------------------------------------------

export const MapCaptureTerrainInputSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema.optional(),
  center: LonLat,
  /** Side of the square in metres. Roads are captured up to 25 km; Terrain's largest world is 65.5 km. */
  sideM: z.number().min(MAP_CAPTURE_MIN_SIDE_M).max(MAP_CAPTURE_MAX_SIDE_M),
  /** Heightmap samples per side: Terrain's resolutions, 129 to 4097. */
  size: TerrainSize,
  /** A place name for the capture's folder. */
  place: z.string().max(80).optional(),
  /** Create a Terrain from the capture (default true). */
  handoff: z.boolean().optional(),
  /** Also start that terrain's build (default false). */
  build: z.boolean().optional(),
});
export const MapCaptureTerrainResultSchema = z.object({
  captureId: z.string(),
  /** The folder name under `captures/`. */
  name: z.string(),
  capture: MapCaptureFileSchema,
  /** The terrain the capture was handed to; look at it with `terrain_get_spec` / `terrain_render_preview`. */
  terrain: z.object({ project: z.string(), terrain: z.string() }).optional(),
  /** Layers the capture could not produce, with the reason (`slot`, `reason`). */
  missing: z.array(z.object({ slot: z.string(), reason: z.string() })),
});
