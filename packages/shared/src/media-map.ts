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

// --- layers (Theme H) --------------------------------------------------------

/** Layers live at `layers/<name>.geojson` inside the project folder. */
export const MAP_LAYERS_DIR = 'layers';
export const MAP_LAYER_EXT = '.geojson';
export const MAP_LAYER_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAP_LAYER = 'drawings';
export const DEFAULT_MAP_LAYER_COLOR = '#3b82f6';
export const MAP_LAYER_KINDS = ['pin', 'path', 'circle', 'area'] as const;
export type MapLayerKind = (typeof MAP_LAYER_KINDS)[number];

/** A layer's name: what the file is called, minus the extension. No separators, so it cannot leave `layers/`. */
export const MapLayerNameSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[^/\\\0]+$/, 'No slashes in a layer name.')
  .refine((n) => n.trim() === n && !n.startsWith('.'), 'No leading dot or edge spaces.');
export const mapLayerPath = (name: string): string => `${MAP_LAYERS_DIR}/${name}${MAP_LAYER_EXT}`;
export const mapLayerNameOf = (path: string): string | null => {
  const m = /^layers\/([^/]+)\.geojson$/.exec(path);
  return m ? m[1]! : null;
};

const Position = z.tuple([z.number(), z.number()]).rest(z.number());

const LayerGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: Position }),
  z.object({ type: z.literal('LineString'), coordinates: z.array(Position).min(2) }),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(Position).min(4)).min(1) }),
]);

export const MapLayerFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.union([z.string(), z.number()]).optional(),
  geometry: LayerGeometrySchema,
  properties: z
    .object({
      kind: z.enum(MAP_LAYER_KINDS),
      label: z.string().optional(),
      note: z.string().optional(),
      /** Overrides the layer's colour for this feature only. */
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      /** A circle keeps its centre and radius so it re-renders exactly; its geometry is the 128-gon. */
      center: z.tuple([z.number(), z.number()]).optional(),
      radiusM: z.number().positive().optional(),
    })
    .passthrough(),
});
export type MapLayerFeature = z.infer<typeof MapLayerFeatureSchema>;

export const MapLayerFileSchema = z
  .object({ type: z.literal('FeatureCollection'), features: z.array(MapLayerFeatureSchema) })
  .passthrough();
export type MapLayerFile = z.infer<typeof MapLayerFileSchema>;

export const emptyLayer = (): MapLayerFile => ({ type: 'FeatureCollection', features: [] });

/** `null` when the text is not a valid layer. */
export function parseLayer(text: string): MapLayerFile | null {
  try {
    const parsed = MapLayerFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const LEAD_KEYS = ['type', 'id', 'geometry', 'properties'] as const;
const round7 = (n: number): number => Math.round(n * 1e7) / 1e7;
const roundCoords = (v: unknown): unknown => (Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? round7(x) : roundCoords(x))) : v);

function sortKeys(value: unknown, key?: string): unknown {
  if (key === 'coordinates' || key === 'center') return roundCoords(value);
  if (Array.isArray(value)) return value.map((v) => sortKeys(v));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    const lead = LEAD_KEYS.filter((k) => keys.includes(k));
    const rest = keys.filter((k) => !(LEAD_KEYS as readonly string[]).includes(k)).sort();
    return Object.fromEntries([...lead, ...rest].map((k) => [k, sortKeys(obj[k], k)]));
  }
  return value;
}

/**
 * The one way a layer is written: stable key order (`type`, `id`, `geometry`, `properties`, then
 * alphabetical) at every level, coordinates rounded to 7 dp, 2-space indent, trailing newline — so a
 * git diff of a layer shows only what changed.
 */
export function stringifyLayer(fc: MapLayerFile): string {
  return `${JSON.stringify(sortKeys(fc), null, 2)}\n`;
}
