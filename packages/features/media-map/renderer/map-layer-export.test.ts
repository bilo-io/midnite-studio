import { emptyLayer } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { layerExportText } from './map-layer-export';

describe('layerExportText', () => {
  it('writes GeoJSON through stringifyLayer and KML through the converter', () => {
    const fc = { ...emptyLayer(), features: [{ type: 'Feature' as const, id: 'a', geometry: { type: 'Point' as const, coordinates: [1, 2] as [number, number] }, properties: { kind: 'pin' as const, label: 'A' } }] };
    expect(layerExportText('x', fc, 'geojson')).toContain('"type": "FeatureCollection"');
    expect(layerExportText('x', fc, 'kml')).toContain('<Placemark><name>A</name>');
    expect(layerExportText('x', fc, 'png')).toBeNull();
  });
});
