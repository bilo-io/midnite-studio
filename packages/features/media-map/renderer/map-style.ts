import {
  activeSatelliteSource,
  mapSource,
  mapTileUrl,
  type MapBasemap,
  type MapSourceId,
  type MapSourceStatus,
} from '@midnite/studio-shared';

/**
 * Pure style assembly for the Maps tab (Phase 108 Theme A). Main serves OpenFreeMap's Liberty and
 * Positron styles already rewritten so every URL is `mstudio-tile://…` (`rewriteStyleUrls`); the
 * four basemaps are composed from those two plus catalogue raster sources. No hostname other than
 * the `mstudio-tile:` scheme ever appears here, so the renderer never talks to a tile host.
 */
export type MapStyleSpec = {
  version: 8;
  sources: Record<string, Record<string, unknown>>;
  layers: Array<Record<string, unknown>>;
  glyphs?: string;
  sprite?: string;
  [key: string]: unknown;
};

export type BaseStyles = { liberty: MapStyleSpec; positron: MapStyleSpec };

/** The catalogue sources a basemap draws, in attribution order. */
export function basemapSources(basemap: MapBasemap, statuses: readonly MapSourceStatus[]): MapSourceId[] {
  switch (basemap) {
    case 'streets':
    case 'dark':
      return ['openfreemap', 'openfreemap-relief'];
    case 'satellite':
      return [activeSatelliteSource(statuses), 'openfreemap'];
    case 'terrain':
      return ['openfreemap', 'aws-terrarium'];
  }
}

/** De-duplicated attribution strings, straight from the catalogue. */
export function basemapAttribution(basemap: MapBasemap, statuses: readonly MapSourceStatus[]): string[] {
  return [...new Set(basemapSources(basemap, statuses).map((id) => mapSource(id).attribution))];
}

// --- dark ----------------------------------------------------------------------

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

/** Parses `#rgb`, `#rrggbb`, `rgb()/rgba()` and `hsl()/hsla()`; null when it is not a colour. */
function parseColor(input: string): { h: number; s: number; l: number; a: number } | null {
  const value = input.trim().toLowerCase();
  let match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (match) {
    const hex = match[1]!.length === 3 ? match[1]!.replace(/./g, (c) => c + c) : match[1]!;
    const [h, s, l] = rgbToHsl(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
    return { h, s, l, a: 1 };
  }
  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(value);
  if (match) {
    const [h, s, l] = rgbToHsl(Number(match[1]), Number(match[2]), Number(match[3]));
    return { h, s, l, a: match[4] === undefined ? 1 : Number(match[4]) };
  }
  match = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+))?\s*\)$/.exec(value);
  if (match) return { h: Number(match[1]), s: Number(match[2]) / 100, l: Number(match[3]) / 100, a: match[4] === undefined ? 1 : Number(match[4]) };
  return null;
}

/** Flips lightness (kept off pure black/white) and keeps hue, so a light map reads as a dark one. */
export function darkenColor(input: string): string {
  const color = parseColor(input);
  if (!color) return input;
  const l = clamp01(0.1 + (1 - color.l) * 0.7);
  return `hsla(${Math.round(color.h)}, ${Math.round(color.s * 100 * 0.8)}%, ${Math.round(l * 100)}%, ${color.a})`;
}

const darkenValue = (value: unknown): unknown => {
  if (typeof value === 'string') return darkenColor(value);
  if (Array.isArray(value)) return value.map(darkenValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, darkenValue(v)]));
  return value;
};

/**
 * Maps each layer's colour paint properties through {@link darkenColor}. Pure: no second style
 * download, and the input is not mutated.
 */
export function darkenStyle<T extends MapStyleSpec>(style: T): T {
  const layers = style.layers.map((layer) => {
    const paint = layer['paint'];
    if (!paint || typeof paint !== 'object') return layer;
    const next = Object.fromEntries(
      Object.entries(paint as Record<string, unknown>).map(([key, value]) => [key, key.endsWith('-color') ? darkenValue(value) : value]),
    );
    return { ...layer, paint: next };
  });
  return { ...style, layers };
}

// --- basemaps --------------------------------------------------------------------

export type BuildMapStyleOptions = {
  statuses: readonly MapSourceStatus[];
  base: BaseStyles;
};

const isSymbol = (layer: Record<string, unknown>) => layer['type'] === 'symbol';

/** One of the four basemaps as a MapLibre style whose every URL is `mstudio-tile://…`. */
export function buildMapStyle(basemap: MapBasemap, opts: BuildMapStyleOptions): MapStyleSpec {
  const { liberty, positron } = opts.base;
  switch (basemap) {
    case 'streets':
      return liberty;
    case 'dark':
      return darkenStyle(positron);
    case 'satellite': {
      const id = activeSatelliteSource(opts.statuses);
      const source = mapSource(id);
      return {
        ...liberty,
        sources: {
          ...liberty.sources,
          satellite: { type: 'raster', tiles: [mapTileUrl(id)], tileSize: source.tileSize, minzoom: source.minZoom, maxzoom: source.maxZoom },
        },
        layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }, ...liberty.layers.filter(isSymbol)],
      };
    }
    case 'terrain': {
      const dem = mapSource('aws-terrarium');
      const hillshade = { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.5 } };
      const at = positron.layers.findIndex(isSymbol);
      const layers = [...positron.layers];
      layers.splice(at === -1 ? layers.length : at, 0, hillshade);
      return {
        ...positron,
        sources: {
          ...positron.sources,
          dem: { type: 'raster-dem', tiles: [mapTileUrl('aws-terrarium')], tileSize: dem.tileSize, maxzoom: dem.maxZoom, encoding: 'terrarium' },
        },
        layers,
      };
    }
  }
}

/** Every URL a style carries, for the "nothing but mstudio-tile:" check. */
export function styleUrls(style: MapStyleSpec): string[] {
  const urls: string[] = [];
  if (style.glyphs) urls.push(style.glyphs);
  if (style.sprite) urls.push(style.sprite);
  for (const source of Object.values(style.sources)) {
    if (typeof source['url'] === 'string') urls.push(source['url']);
    if (Array.isArray(source['tiles'])) urls.push(...(source['tiles'] as string[]));
  }
  return urls;
}
