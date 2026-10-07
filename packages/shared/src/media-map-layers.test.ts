import { describe, expect, it } from 'vitest';

import { geodesicCircle } from './map';
import { mapLayerNameOf, mapLayerPath, parseLayer, stringifyLayer, type MapLayerFile } from './media-map';

const sample: MapLayerFile = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'a', geometry: { type: 'Point', coordinates: [18.123456789, -33.9] }, properties: { kind: 'pin', label: 'Pin', color: '#ff0000' } },
    { type: 'Feature', id: 'b', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { kind: 'path' } },
    { type: 'Feature', id: 'c', geometry: { type: 'Polygon', coordinates: [geodesicCircle([1, 2], 500, 8)] }, properties: { kind: 'circle', center: [1, 2], radiusM: 500 } },
  ],
};

describe('layer files', () => {
  it('round-trips byte for byte and rounds to 7 dp', () => {
    const text = stringifyLayer(sample);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('18.1234568');
    expect(stringifyLayer(parseLayer(text)!)).toBe(text);
  });
  it('a key-shuffled input yields the same bytes', () => {
    const shuffled = {
      features: sample.features.map((f) => ({ properties: f.properties, geometry: f.geometry, id: f.id, type: f.type })),
      type: 'FeatureCollection',
    } as MapLayerFile;
    expect(stringifyLayer(shuffled)).toBe(stringifyLayer(sample));
    const first = stringifyLayer(sample).split('\n');
    expect(first[1]).toContain('"type": "FeatureCollection"'.slice(0, 8));
  });
  it('leads each feature with type, id, geometry, properties', () => {
    const text = stringifyLayer(sample);
    expect(text.indexOf('"type": "Feature"')).toBeLessThan(text.indexOf('"id": "a"'));
    expect(text.indexOf('"id": "a"')).toBeLessThan(text.indexOf('"geometry"'));
    expect(text.indexOf('"geometry"')).toBeLessThan(text.indexOf('"properties"'));
  });
  it('rejects non-layers', () => {
    expect(parseLayer('nope')).toBeNull();
    expect(parseLayer('{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"MultiPoint","coordinates":[]},"properties":{"kind":"pin"}}]}')).toBeNull();
  });
  it('maps names to paths', () => {
    expect(mapLayerPath('roads')).toBe('layers/roads.geojson');
    expect(mapLayerNameOf('layers/roads.geojson')).toBe('roads');
    expect(mapLayerNameOf('layers/x/y.geojson')).toBeNull();
  });
});
