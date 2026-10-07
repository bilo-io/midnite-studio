/**
 * Media ▸ Maps (Phase 108) — the wire contract, the tile-source catalogue and the on-disk project.
 *
 * A map project is a folder, `.midnite/media/map/<project>/`:
 *
 *   map.json       the {@link MapProjectFile}: last viewport, basemap, 3D, layer order and styles
 *   layers/        GeoJSON drawings (Theme H)
 *   captures/      terrain captures (Theme D)
 *
 * **Every tile goes through `mstudio-tile:`** (Decision 10). A URL template in {@link MAP_SOURCES} is
 * only ever expanded in main — keyed ones carry `{key}`, and the renderer is told whether a key is
 * set, never what it is. The renderer's style only ever names `mstudio-tile://<source>/…`.
 */
import { z } from 'zod';

import { GitOpResultOf } from './domain/result';
import { nativeMPerPx } from './map/mercator';
import { MediaProjectNameSchema } from './media';

// --- constants ---------------------------------------------------------------

export const MAP_PROJECT_FILE = 'map.json';
export const DEFAULT_MAP_PROJECT = 'maps';
/** The scheme main serves every tile, glyph, sprite, style and TileJSON on. */
export const MSTUDIO_TILE_SCHEME = 'mstudio-tile' as const;

export const MAP_BASEMAPS = ['streets', 'satellite', 'terrain', 'dark'] as const;
export type MapBasemap = (typeof MAP_BASEMAPS)[number];
export const MAP_BASEMAP_LABEL: Record<MapBasemap, string> = {
  streets: 'Streets',
  satellite: 'Satellite',
  terrain: 'Terrain',
  dark: 'Dark',
};

/** Cape Town — the default view of a new map. */
export const DEFAULT_MAP_CENTER: [number, number] = [18.4241, -33.9249];
export const DEFAULT_MAP_ZOOM = 10;

// --- sources -----------------------------------------------------------------

export const MAP_SOURCE_KINDS = ['dem', 'satellite', 'vector', 'basemap'] as const;
export const MAP_SOURCE_ENCODINGS = ['terrarium', 'terrain-rgb', 'png', 'jpeg', 'webp', 'mvt'] as const;
export type MapSourceEncoding = (typeof MAP_SOURCE_ENCODINGS)[number];

export const MAP_SOURCE_IDS = [
  'aws-terrarium',
  'openfreemap',
  'openfreemap-relief',
  'eox-s2cloudless-2016',
  'maptiler-satellite',
  'maptiler-terrain-rgb',
  'maptiler-streets',
] as const;
export const MapSourceIdSchema = z.enum(MAP_SOURCE_IDS);
export type MapSourceId = z.infer<typeof MapSourceIdSchema>;

export const MapSourceSchema = z.object({
  id: MapSourceIdSchema,
  label: z.string().min(1),
  kind: z.enum(MAP_SOURCE_KINDS),
  /** `{z}/{x}/{y}` and an optional `{key}`. Absent on a source reached only through its TileJSON. */
  template: z.string().optional(),
  /** Upstream TileJSON; its `tiles[0]` becomes the template the first time main reads it. */
  tileJsonUrl: z.string().optional(),
  /** Upstream style JSONs by name (served rewritten at `/style/<name>`). */
  styles: z.record(z.string(), z.string()).optional(),
  /** Upstream glyphs, `{fontstack}/{range}` (served at `/fonts/<stack>/<range>.pbf`). */
  glyphs: z.string().optional(),
  /** Upstream sprite base, without the `@2x` / `.json` suffix (served at `/sprite…`). */
  sprite: z.string().optional(),
  minZoom: z.number().int().min(0),
  maxZoom: z.number().int().max(24),
  tileSize: z.number().int().positive(),
  encoding: z.enum(MAP_SOURCE_ENCODINGS),
  licence: z.string(),
  attribution: z.string(),
  exportable: z.boolean(),
  /** Why a source is display-only. */
  exportReason: z.string().optional(),
  requiresKey: z.boolean().optional(),
});
export type MapSource = z.infer<typeof MapSourceSchema>;

const OFM = 'https://tiles.openfreemap.org';
const OSM_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';

/**
 * The catalogue. Licences were read from each provider's published terms when the phase was refined;
 * the dated per-source re-read is a Theme J human pass.
 */
export const MAP_SOURCES: readonly MapSource[] = [
  {
    id: 'aws-terrarium',
    label: 'AWS Terrain Tiles',
    kind: 'dem',
    template: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    minZoom: 0,
    maxZoom: 15,
    tileSize: 256,
    encoding: 'terrarium',
    licence: 'Mixed open licences — see the Terrain Tiles sources list',
    attribution: 'Terrain Tiles: Mapzen, AWS Open Data — see sources list',
    exportable: true,
  },
  {
    id: 'openfreemap',
    label: 'OpenFreeMap',
    kind: 'vector',
    tileJsonUrl: `${OFM}/planet`,
    styles: { liberty: `${OFM}/styles/liberty`, positron: `${OFM}/styles/positron` },
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${OFM}/sprites/ofm_f384/ofm`,
    minZoom: 0,
    maxZoom: 14,
    tileSize: 512,
    encoding: 'mvt',
    licence: 'ODbL (OpenStreetMap data), OpenMapTiles schema',
    attribution: `OpenFreeMap ${OSM_ATTRIBUTION}`,
    exportable: false,
    exportReason: 'Vector tiles are used for display only',
  },
  {
    // The shaded relief OpenFreeMap's own styles draw at low zoom; listed so the rewritten style keeps it.
    id: 'openfreemap-relief',
    label: 'Natural Earth relief',
    kind: 'basemap',
    template: `${OFM}/natural_earth/ne2sr/{z}/{x}/{y}.png`,
    minZoom: 0,
    maxZoom: 6,
    tileSize: 256,
    encoding: 'png',
    licence: 'Public domain (Natural Earth)',
    attribution: 'Natural Earth',
    exportable: false,
    exportReason: 'Background relief is used for display only',
  },
  {
    // The 2016 layer is pinned: later EOX vintages are CC BY-NC-SA.
    id: 'eox-s2cloudless-2016',
    label: 'Sentinel-2 cloudless 2016 (EOX)',
    kind: 'satellite',
    template: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
    minZoom: 0,
    maxZoom: 14,
    tileSize: 256,
    encoding: 'jpeg',
    licence: 'CC BY 4.0',
    attribution:
      'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)',
    exportable: true,
  },
  {
    id: 'maptiler-satellite',
    label: 'MapTiler Satellite',
    kind: 'satellite',
    template: 'https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key={key}',
    minZoom: 0,
    maxZoom: 20,
    tileSize: 256,
    encoding: 'jpeg',
    licence: 'MapTiler terms of the active plan',
    attribution: '© MapTiler © OpenStreetMap contributors',
    exportable: true,
    requiresKey: true,
  },
  {
    // z14 is shallower than Terrarium's z15, so it is never the DEM default.
    id: 'maptiler-terrain-rgb',
    label: 'MapTiler Terrain-RGB',
    kind: 'dem',
    template: 'https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key={key}',
    minZoom: 0,
    maxZoom: 14,
    tileSize: 512,
    encoding: 'terrain-rgb',
    licence: 'MapTiler terms of the active plan',
    attribution: '© MapTiler',
    exportable: true,
    requiresKey: true,
  },
  {
    id: 'maptiler-streets',
    label: 'MapTiler Streets',
    kind: 'vector',
    tileJsonUrl: 'https://api.maptiler.com/tiles/v3/tiles.json?key={key}',
    styles: { streets: 'https://api.maptiler.com/maps/streets-v2/style.json?key={key}' },
    glyphs: 'https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key={key}',
    minZoom: 0,
    maxZoom: 14,
    tileSize: 512,
    encoding: 'mvt',
    licence: 'MapTiler terms of the active plan',
    attribution: `© MapTiler ${OSM_ATTRIBUTION}`,
    exportable: false,
    exportReason: 'Vector tiles are used for display only',
    requiresKey: true,
  },
];

/** Throws on an unknown id — a programmer error; validate with `MapSourceIdSchema` first. */
export function mapSource(id: string): MapSource {
  const found = MAP_SOURCES.find((source) => source.id === id);
  if (!found) throw new Error(`Unknown map source: ${id}`);
  return found;
}

export const MAP_SOURCE_CONTENT_TYPE: Record<MapSourceEncoding, string> = {
  terrarium: 'image/png',
  'terrain-rgb': 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mvt: 'application/x-protobuf',
};

/** The cache file extension for a source's tiles. */
export const MAP_SOURCE_EXT: Record<MapSourceEncoding, string> = {
  terrarium: 'png',
  'terrain-rgb': 'webp',
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  mvt: 'pbf',
};

/** `mstudio-tile://<source>/{z}/{x}/{y}` — the only tile URL the renderer ever sees. */
export const mapTileUrl = (id: MapSourceId): string => `${MSTUDIO_TILE_SCHEME}://${id}/{z}/{x}/{y}`;
export const mapTileJsonUrl = (id: MapSourceId): string => `${MSTUDIO_TILE_SCHEME}://${id}/tilejson`;
export const mapStyleUrl = (id: MapSourceId, name: string): string => `${MSTUDIO_TILE_SCHEME}://${id}/style/${name}`;
export const mapGlyphsUrl = (id: MapSourceId): string => `${MSTUDIO_TILE_SCHEME}://${id}/fonts/{fontstack}/{range}.pbf`;
export const mapSpriteUrl = (id: MapSourceId): string => `${MSTUDIO_TILE_SCHEME}://${id}/sprite`;

/** Expand a template in main. Never call this in the renderer with a key. */
export function expandMapTemplate(template: string, vars: { z?: number; x?: number; y?: number; key?: string | null }): string {
  return template
    .replace('{z}', String(vars.z ?? ''))
    .replace('{x}', String(vars.x ?? ''))
    .replace('{y}', String(vars.y ?? ''))
    .replace('{key}', encodeURIComponent(vars.key ?? ''));
}

/** Whether a keyed source can be used, as the renderer learns it — never the key itself. */
export const MapSourceStatusSchema = z.object({
  id: MapSourceIdSchema,
  available: z.boolean(),
  reason: z.string().optional(),
});
export type MapSourceStatus = z.infer<typeof MapSourceStatusSchema>;

export const MAP_KEY_MISSING_REASON = 'Add a MapTiler key in Settings ▸ Media.';

/** The satellite a basemap draws: MapTiler when its key is set, else EOX (Decision 1). */
export function activeSatelliteSource(statuses: readonly MapSourceStatus[]): MapSourceId {
  return statuses.find((s) => s.id === 'maptiler-satellite')?.available ? 'maptiler-satellite' : 'eox-s2cloudless-2016';
}

// --- style rewrite (pure; main runs it on every served style) ----------------

type StyleLike = {
  sources?: Record<string, Record<string, unknown>>;
  layers?: Array<Record<string, unknown>>;
  glyphs?: unknown;
  sprite?: unknown;
  [key: string]: unknown;
};

const stripQuery = (url: string): string => url.split('?')[0] ?? url;

/** The catalogue source an upstream tile template or TileJSON URL belongs to. */
function matchUpstream(url: string): { id: MapSourceId; as: 'tiles' | 'tilejson' } | null {
  const bare = stripQuery(url);
  for (const source of MAP_SOURCES) {
    if (source.template && stripQuery(source.template) === bare) return { id: source.id, as: 'tiles' };
    if (source.tileJsonUrl && stripQuery(source.tileJsonUrl) === bare) return { id: source.id, as: 'tilejson' };
  }
  return null;
}

/**
 * Rewrites an upstream style so every URL in it is `mstudio-tile://…`. A source the catalogue does
 * not know is dropped, with every layer that draws it — so no third-party host ever reaches the
 * renderer. `glyphs` and `sprite` are served by `owner`, the source whose style this is.
 */
export function rewriteStyleUrls<T extends StyleLike>(style: T, owner: MapSourceId): T {
  const sources: Record<string, Record<string, unknown>> = {};
  const dropped = new Set<string>();
  for (const [name, raw] of Object.entries(style.sources ?? {})) {
    const next: Record<string, unknown> = { ...raw };
    if (typeof raw['url'] === 'string') {
      const match = matchUpstream(raw['url']);
      if (!match) {
        dropped.add(name);
        continue;
      }
      if (match.as === 'tilejson') {
        next['url'] = mapTileJsonUrl(match.id);
      } else {
        delete next['url'];
        next['tiles'] = [mapTileUrl(match.id)];
      }
    }
    if (Array.isArray(raw['tiles'])) {
      const first = raw['tiles'][0];
      const match = typeof first === 'string' ? matchUpstream(first) : null;
      if (!match || match.as !== 'tiles') {
        dropped.add(name);
        continue;
      }
      next['tiles'] = [mapTileUrl(match.id)];
    }
    if (typeof raw['data'] === 'string') {
      dropped.add(name);
      continue;
    }
    sources[name] = next;
  }
  const owned = mapSource(owner);
  const out: StyleLike = {
    ...style,
    sources,
    layers: (style.layers ?? []).filter((layer) => typeof layer['source'] !== 'string' || !dropped.has(layer['source'])),
  };
  if (owned.glyphs) out.glyphs = mapGlyphsUrl(owner);
  else delete out.glyphs;
  if (owned.sprite) out.sprite = mapSpriteUrl(owner);
  else delete out.sprite;
  return out as T;
}

// --- the project file --------------------------------------------------------

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const MapViewSchema = z.object({
  center: LonLat,
  zoom: z.number().min(0).max(22),
  bearing: z.number().min(-180).max(180),
  pitch: z.number().min(0).max(85),
});
export type MapView = z.infer<typeof MapViewSchema>;

export const MapFrameSchema = z.object({
  center: LonLat,
  sideM: z.number().min(16).max(65_536),
  size: z.union([z.literal(129), z.literal(257), z.literal(513), z.literal(1025), z.literal(2049), z.literal(4097)]),
});
export type MapFrame = z.infer<typeof MapFrameSchema>;

const MapProjectFields = {
  view: MapViewSchema,
  basemap: z.enum(MAP_BASEMAPS),
  terrain3d: z.object({ on: z.boolean(), exaggeration: z.number().min(1).max(3) }),
  layerOrder: z.array(z.string()),
  layerStyle: z.record(z.string(), z.object({ color: Hex, visible: z.boolean() })),
  frame: MapFrameSchema.optional(),
};

export const MapProjectFileSchema = z
  .object({
    version: z.literal(1).default(1),
    view: MapProjectFields.view.default({ center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM, bearing: 0, pitch: 0 }),
    basemap: MapProjectFields.basemap.default('streets'),
    terrain3d: MapProjectFields.terrain3d.default({ on: false, exaggeration: 1.5 }),
    layerOrder: MapProjectFields.layerOrder.default([]),
    layerStyle: MapProjectFields.layerStyle.default({}),
    frame: MapProjectFields.frame,
  })
  .passthrough();
export type MapProjectFile = z.infer<typeof MapProjectFileSchema>;

export const defaultMapProject = (): MapProjectFile => MapProjectFileSchema.parse({});

/** A shallow patch: each top-level field replaces the stored one whole. */
export const MapProjectPatchSchema = z.object(MapProjectFields).partial().strict();
export type MapProjectPatch = z.infer<typeof MapProjectPatchSchema>;

// --- requests / results ------------------------------------------------------

export const MapTargetSchema = z.object({ repoId: z.string().min(1), project: MediaProjectNameSchema });
export const MapSetViewRequestSchema = MapTargetSchema.extend({ patch: MapProjectPatchSchema });

export const MapProjectGetResultSchema = z.object({
  map: MapProjectFileSchema,
  /** Set when `map.json` existed but was not valid — the defaults came back instead. */
  warning: z.string().optional(),
});
export type MapProjectGetResult = z.infer<typeof MapProjectGetResultSchema>;

export const MAP_CACHE_CAP_MB = { min: 256, max: 8192, default: 1024, step: 256 } as const;

export const MapCacheRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('status') }),
  z.object({ op: z.literal('clear') }),
  z.object({ op: z.literal('set-cap'), capMB: z.number().int().min(MAP_CACHE_CAP_MB.min).max(MAP_CACHE_CAP_MB.max) }),
]);
export type MapCacheRequest = z.infer<typeof MapCacheRequestSchema>;
export const MapCacheStatusSchema = z.object({
  bytes: z.number().nonnegative(),
  tiles: z.number().int().nonnegative(),
  capMB: z.number().int().positive(),
});
export type MapCacheStatus = z.infer<typeof MapCacheStatusSchema>;

export const MapResultSchemas = {
  get: GitOpResultOf(MapProjectGetResultSchema),
  setView: GitOpResultOf(MapProjectGetResultSchema),
  cache: GitOpResultOf(MapCacheStatusSchema),
} as const;
export const MapSourcesResponseSchema = z.object({ sources: z.array(MapSourceStatusSchema) });

// --- capture framing (Phase 108 Theme C) ---------------------------------------

export const MAP_FRAME_MIN_SIDE_M = 16;
export const MAP_FRAME_MAX_SIDE_M = 65_536;
/** Roads are fetched from Overpass only for frames up to this side (Decision 17). */
export const MAP_ROADS_MAX_SIDE_M = 25_000;

export type CaptureWarning = { code: 'over-cap' | 'under-min' | 'dem-coarser' | 'roads-skipped'; message: string; blocking: boolean };

/**
 * What is wrong with this frame and output size, with the literal copy the panel shows. Pure: `dem` is the
 * elevation source the capture would read (the keyless default when omitted).
 */
export function captureWarnings(frame: { center: readonly [number, number]; sideM: number }, size: number, dem: MapSource = mapSource('aws-terrarium')): CaptureWarning[] {
  const out: CaptureWarning[] = [];
  if (frame.sideM > MAP_FRAME_MAX_SIDE_M) out.push({ code: 'over-cap', message: "Terrain's largest world is 65.5 km a side.", blocking: true });
  if (frame.sideM < MAP_FRAME_MIN_SIDE_M) out.push({ code: 'under-min', message: "Terrain's smallest world is 16 m a side.", blocking: true });
  const mPerPx = frame.sideM / (size - 1);
  const native = nativeMPerPx(dem.maxZoom, frame.center[1], dem.tileSize);
  if (mPerPx < native / 2) {
    out.push({
      code: 'dem-coarser',
      message: `The elevation data is ~${Math.round(native)} m/px here; a smaller size gives the same detail.`,
      blocking: false,
    });
  }
  if (frame.sideM > MAP_ROADS_MAX_SIDE_M) out.push({ code: 'roads-skipped', message: 'Roads are captured for frames up to 25 km a side.', blocking: false });
  return out;
}
