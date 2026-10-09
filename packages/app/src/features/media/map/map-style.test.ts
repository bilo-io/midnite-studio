import { MAP_BASEMAPS, MAP_SOURCES, mapGlyphsUrl, mapSource, mapSpriteUrl, mapTileJsonUrl, MSTUDIO_TILE_SCHEME, type MapSourceStatus } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { basemapAttribution, basemapSources, buildMapStyle, darkenColor, darkenStyle, styleUrls, type BaseStyles, type MapStyleSpec } from './map-style';

const style = (): MapStyleSpec => ({
  version: 8,
  glyphs: mapGlyphsUrl('openfreemap'),
  sprite: mapSpriteUrl('openfreemap'),
  sources: { openmaptiles: { type: 'vector', url: mapTileJsonUrl('openfreemap') } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', paint: { 'fill-color': 'hsl(210, 60%, 80%)', 'fill-opacity': 0.8 } },
    { id: 'label', type: 'symbol', source: 'openmaptiles', paint: { 'text-color': 'rgb(10, 10, 10)' } },
  ],
});
const base: BaseStyles = { liberty: style(), positron: style() };
const noKey: MapSourceStatus[] = [{ id: 'maptiler-satellite', available: false }];
const keyed: MapSourceStatus[] = [{ id: 'maptiler-satellite', available: true }];

describe('buildMapStyle', () => {
  it.each([...MAP_BASEMAPS])('%s: every URL starts with mstudio-tile://', (basemap) => {
    const urls = styleUrls(buildMapStyle(basemap, { statuses: noKey, base }));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith(`${MSTUDIO_TILE_SCHEME}://`)).toBe(true);
  });

  it.each([...MAP_BASEMAPS])('%s: attribution equals the catalogue for the sources used', (basemap) => {
    const expected = [...new Set(basemapSources(basemap, noKey).map((id) => mapSource(id).attribution))];
    expect(basemapAttribution(basemap, noKey)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('satellite uses EOX without a key and MapTiler with one', () => {
    expect(buildMapStyle('satellite', { statuses: noKey, base }).sources['satellite']!['tiles']).toEqual(['mstudio-tile://eox-s2cloudless-2016/{z}/{x}/{y}']);
    expect(buildMapStyle('satellite', { statuses: keyed, base }).sources['satellite']!['tiles']).toEqual(['mstudio-tile://maptiler-satellite/{z}/{x}/{y}']);
  });

  it('satellite keeps only the symbol layers of Liberty above the imagery', () => {
    const layers = buildMapStyle('satellite', { statuses: noKey, base }).layers.map((l) => l['id']);
    expect(layers).toEqual(['satellite', 'label']);
  });

  it('terrain adds a hillshade over a terrarium DEM, below the labels', () => {
    const out = buildMapStyle('terrain', { statuses: noKey, base });
    expect(out.sources['dem']!['encoding']).toBe('terrarium');
    expect(out.layers.map((l) => l['id'])).toEqual(['background', 'water', 'hillshade', 'label']);
  });

  it('every catalogue source id used is known', () => {
    const ids = new Set(MAP_SOURCES.map((s) => s.id));
    for (const b of MAP_BASEMAPS) for (const id of basemapSources(b, noKey)) expect(ids.has(id)).toBe(true);
  });
});

describe('darkenStyle', () => {
  it('turns a white background dark and leaves the input alone', () => {
    const input = style();
    const out = darkenStyle(input);
    expect((input.layers[0]!['paint'] as Record<string, string>)['background-color']).toBe('#ffffff');
    expect((out.layers[0]!['paint'] as Record<string, string>)['background-color']).toMatch(/^hsla\(0, 0%, 1\d%/);
    expect((out.layers[1]!['paint'] as Record<string, unknown>)['fill-opacity']).toBe(0.8);
  });

  it('leaves a non-colour string untouched', () => {
    expect(darkenColor('visible')).toBe('visible');
  });
});
