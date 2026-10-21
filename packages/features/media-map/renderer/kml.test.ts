import { describe, expect, it } from 'vitest';

import { geoJsonToKml, importGeoJson, kmlToGeoJson } from './kml';

const FIXTURE = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Table Mountain</name><description>Flat top</description><Point><coordinates>18.4036,-33.9628,0</coordinates></Point></Placemark>
  <Placemark><name>Walk</name><LineString><coordinates>18.4,-33.9,0 18.5,-33.95,0</coordinates></LineString></Placemark>
  <Placemark><name>Plot</name><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0,0 1,0,0 1,1,0 0,0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
  <Placemark><name>Group</name><MultiGeometry><Point><coordinates>1,1</coordinates></Point></MultiGeometry></Placemark>
</Document></kml>`;

describe('kml', () => {
  it('imports one of each geometry and reports the unsupported MultiGeometry as skipped', () => {
    const result = kmlToGeoJson(FIXTURE)!;
    expect(result.skipped).toBe(1);
    expect(result.layer.features.map((f) => f.geometry.type)).toEqual(['Point', 'LineString', 'Polygon']);
    expect(result.layer.features[0]!.properties).toMatchObject({ kind: 'pin', label: 'Table Mountain', note: 'Flat top' });
  });
  it('round-trips through export', () => {
    const first = kmlToGeoJson(FIXTURE)!;
    const again = kmlToGeoJson(geoJsonToKml(first.layer, 'x'))!;
    expect(again.skipped).toBe(0);
    expect(again.layer.features.map((f) => [f.geometry, f.properties.label])).toEqual(first.layer.features.map((f) => [f.geometry, f.properties.label]));
  });
  it('escapes markup in names and rejects non-XML', () => {
    const out = geoJsonToKml({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { kind: 'pin', label: 'A & <B>' } }] }, 'n');
    expect(out).toContain('A &amp; &lt;B&gt;');
    expect(kmlToGeoJson('<kml><oops')).toBeNull();
  });
});

describe('importGeoJson', () => {
  it('accepts plain GeoJSON, derives kinds and labels, and skips multi-geometries', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { name: 'Home', description: 'x' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: null },
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[0, 0]] }, properties: {} },
      ],
    });
    const out = importGeoJson(text)!;
    expect(out.skipped).toBe(1);
    expect(out.layer.features.map((f) => f.properties.kind)).toEqual(['pin', 'path']);
    expect(out.layer.features[0]!.properties).toMatchObject({ label: 'Home', note: 'x' });
    expect(importGeoJson('not json')).toBeNull();
    expect(importGeoJson('{"type":"Topology"}')).toBeNull();
  });
});
