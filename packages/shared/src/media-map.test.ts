import { describe, expect, it } from 'vitest';

import {
  activeSatelliteSource,
  defaultMapProject,
  expandMapTemplate,
  MAP_SOURCE_IDS,
  MAP_SOURCES,
  mapSource,
  MapProjectFileSchema,
  MapProjectPatchSchema,
  MapSourceSchema,
  rewriteStyleUrls,
} from './media-map';
import { MEDIA_TABS, MEDIA_TAB_EXPORT_FORMATS, REPO_SCOPED_MEDIA_TABS } from './media';
import { SECRET_KEYS } from './domain/secrets';

describe('Maps tab (Phase 108 Theme A)', () => {
  it('is the fifth tab, after Audio; ids are unchanged so only the order moves', () => {
    expect(MEDIA_TABS).toHaveLength(9);
    expect(MEDIA_TABS).toEqual(['doc', 'image', 'video', 'audio', 'map', 'terrain', 'model', 'sprite', 'game']);
    expect(REPO_SCOPED_MEDIA_TABS).toContain('map');
    expect(MEDIA_TAB_EXPORT_FORMATS.map).toEqual(['geojson', 'kml']);
  });

  it('defaults a missing map.json to Cape Town at zoom 10', () => {
    const map = defaultMapProject();
    expect(map.view).toEqual({ center: [18.4241, -33.9249], zoom: 10, bearing: 0, pitch: 0 });
    expect(map.basemap).toBe('streets');
    expect(map.version).toBe(1);
  });

  it('keeps unknown keys (passthrough) and rejects a pitch past 85', () => {
    expect(MapProjectFileSchema.parse({ futureKey: 1 })).toMatchObject({ futureKey: 1 });
    expect(MapProjectFileSchema.safeParse({ view: { center: [0, 0], zoom: 3, bearing: 0, pitch: 90 } }).success).toBe(false);
  });

  it('a patch is strict and shallow', () => {
    expect(MapProjectPatchSchema.safeParse({ basemap: 'dark' }).success).toBe(true);
    expect(MapProjectPatchSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
});

describe('MAP_SOURCES (Phase 108 Theme B)', () => {
  it('has unique ids that all parse', () => {
    const ids = MAP_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...MAP_SOURCE_IDS].sort());
    for (const source of MAP_SOURCES) expect(MapSourceSchema.parse(source)).toEqual(source);
  });

  it('every keyed source carries {key} in every upstream URL it has', () => {
    for (const source of MAP_SOURCES.filter((s) => s.requiresKey)) {
      for (const url of [source.template, source.tileJsonUrl, ...Object.values(source.styles ?? {})].filter(Boolean)) {
        expect(url).toContain('{key}');
      }
    }
    expect(SECRET_KEYS).toContain('media.mapTilerApiKey');
  });

  it('every exportable source names its licence and attribution; display-only ones say why', () => {
    for (const source of MAP_SOURCES) {
      if (source.exportable) {
        expect(source.licence.length).toBeGreaterThan(0);
        expect(source.attribution.length).toBeGreaterThan(0);
      } else {
        expect(source.exportReason).toBeTruthy();
      }
    }
  });

  it('pins the keyless defaults the phase decided', () => {
    expect(mapSource('aws-terrarium')).toMatchObject({ kind: 'dem', encoding: 'terrarium', maxZoom: 15, exportable: true });
    expect(mapSource('eox-s2cloudless-2016')).toMatchObject({ kind: 'satellite', encoding: 'jpeg', licence: 'CC BY 4.0', exportable: true });
    expect(mapSource('maptiler-terrain-rgb').maxZoom).toBeLessThan(mapSource('aws-terrarium').maxZoom);
    expect(() => mapSource('nope')).toThrow(/Unknown map source/);
  });

  it('expands a template (main only) and picks the active satellite', () => {
    expect(expandMapTemplate(mapSource('maptiler-satellite').template!, { z: 3, x: 4, y: 5, key: 'k&1' })).toBe(
      'https://api.maptiler.com/tiles/satellite-v2/3/4/5.jpg?key=k%261',
    );
    expect(activeSatelliteSource([])).toBe('eox-s2cloudless-2016');
    expect(activeSatelliteSource([{ id: 'maptiler-satellite', available: true }])).toBe('maptiler-satellite');
  });
});

describe('rewriteStyleUrls', () => {
  it('points every source, glyph and sprite at mstudio-tile:// and drops unknown hosts', () => {
    const style = {
      version: 8,
      sources: {
        openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
        ne2_shaded: { type: 'raster', tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'] },
        rogue: { type: 'raster', tiles: ['https://evil.example/{z}/{x}/{y}.png'] },
      },
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
      layers: [
        { id: 'a', source: 'openmaptiles' },
        { id: 'b', source: 'rogue' },
        { id: 'bg', type: 'background' },
      ],
    };
    const out = rewriteStyleUrls(style, 'openfreemap');
    expect(out.sources).toEqual({
      openmaptiles: { type: 'vector', url: 'mstudio-tile://openfreemap/tilejson' },
      ne2_shaded: { type: 'raster', tiles: ['mstudio-tile://openfreemap-relief/{z}/{x}/{y}'] },
    });
    expect(out.layers.map((l) => l.id)).toEqual(['a', 'bg']);
    expect(out.glyphs).toBe('mstudio-tile://openfreemap/fonts/{fontstack}/{range}.pbf');
    expect(out.sprite).toBe('mstudio-tile://openfreemap/sprite');
    expect(JSON.stringify(out)).not.toMatch(/https?:/);
  });
});
