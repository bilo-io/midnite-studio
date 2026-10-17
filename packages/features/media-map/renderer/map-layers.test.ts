import { emptyLayer, type MapLayerFeature } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { circlePair, draftReadout, drawingsData, featureFacts, selKey, splitSelKey, uniqueLayerName } from './map-layers';
import { circleFeature, initialToolState } from './map-tools';

const pin: MapLayerFeature = { type: 'Feature', id: 'p1', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { kind: 'pin', label: 'A' } };

describe('map layers', () => {
  it('draws only visible, valid layers and folds colour and selection in', () => {
    const fc = { ...emptyLayer(), features: [pin] };
    const out = drawingsData(
      [
        { name: 'a', fc, color: '#112233', visible: true },
        { name: 'hidden', fc, color: '#000000', visible: false },
        { name: 'broken', fc: null, color: '#000000', visible: true },
      ],
      new Set([selKey('a', 'p1')]),
    );
    expect(out.features).toHaveLength(1);
    expect(out.features[0]!.properties).toMatchObject({ color: '#112233', selected: 1, fid: selKey('a', 'p1') });
    expect(splitSelKey(selKey('a', 'p1'))).toEqual({ layer: 'a', id: 'p1' });
  });
  it('reads out a distance draft leg by leg with a geodesic total', () => {
    const r = draftReadout({ tool: 'distance', points: [[0, 0], [1, 0], [1, 1]], radiusM: null }, 'metric')!;
    expect(r.rows.map((x) => x[0])).toEqual(['Leg 1', 'Leg 2', 'Total (geodesic)']);
    expect(draftReadout(initialToolState, 'metric')).toBeNull();
  });
  it('reports an area draft over 200 km as refused', () => {
    expect(draftReadout({ tool: 'area', points: [[0, 0], [3, 0], [3, 3]], radiusM: null }, 'metric')!.rows[0]![1]).toBe('Areas up to 200 km across.');
  });
  it('centre-to-centre distance and gap, negative as overlap', () => {
    const a = circleFeature('a', [0, 0], 1000);
    const far = circleFeature('b', [0.1, 0], 1000);
    const near = circleFeature('c', [0.01, 0], 1000);
    expect(circlePair(a, far, 'metric')![1]![0]).toBe('Gap');
    expect(circlePair(a, near, 'metric')![1]![0]).toBe('Overlap');
    expect(circlePair(a, pin, 'metric')).toBeNull();
  });
  it('facts per kind; unique names', () => {
    expect(featureFacts(pin, 'metric')[0]![0]).toBe('Position');
    expect(featureFacts(circleFeature('a', [0, 0], 500), 'metric')[0]).toEqual(['Radius', '500 m']);
    expect(uniqueLayerName('drawings', ['drawings', 'drawings 2'])).toBe('drawings 3');
  });
});
