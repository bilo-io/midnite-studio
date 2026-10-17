import { describe, expect, it } from 'vitest';

import { canFinish, draftShape, featureFromDraft, initialToolState, mapToolReducer, type MapToolState } from './map-tools';

const run = (actions: Parameters<typeof mapToolReducer>[1][], from: MapToolState = initialToolState) => actions.reduce(mapToolReducer, from);

describe('mapToolReducer', () => {
  it('selecting a tool clears the draft; selecting it again returns to pan', () => {
    const s = run([{ type: 'select', tool: 'distance' }, { type: 'click', point: [1, 1] }]);
    expect(s.points).toHaveLength(1);
    expect(run([{ type: 'select', tool: 'area' }], s)).toMatchObject({ tool: 'area', points: [] });
    expect(run([{ type: 'select', tool: 'distance' }], s)).toEqual(initialToolState);
  });
  it('a distance path collects points, ignores a repeat click and finishes at two', () => {
    let s = run([{ type: 'select', tool: 'distance' }, { type: 'click', point: [0, 0] }]);
    expect(canFinish(s)).toBe(false);
    s = run([{ type: 'click', point: [0, 0] }, { type: 'click', point: [1, 0] }], s);
    expect(s.points).toHaveLength(2);
    expect(draftShape(s)).toEqual({ kind: 'path', points: [[0, 0], [1, 0]] });
  });
  it('vertices can be moved and undone', () => {
    let s = run([{ type: 'select', tool: 'area' }, { type: 'click', point: [0, 0] }, { type: 'click', point: [1, 0] }, { type: 'click', point: [1, 1] }]);
    expect(canFinish(s)).toBe(true);
    s = run([{ type: 'move', index: 1, point: [2, 0] }], s);
    expect(s.points[1]).toEqual([2, 0]);
    expect(run([{ type: 'move', index: 9, point: [0, 0] }], s)).toBe(s);
    expect(run([{ type: 'undo' }], s).points).toHaveLength(2);
  });
  it('a circle takes its radius from the second click and can finish on the centre alone', () => {
    let s = run([{ type: 'select', tool: 'circle' }, { type: 'click', point: [10, 0] }]);
    expect(draftShape(s)).toMatchObject({ kind: 'circle', radiusM: 1000 });
    s = run([{ type: 'click', point: [10.01, 0] }], s);
    expect(s.radiusM).toBeGreaterThan(1000);
    expect(s.radiusM).toBeLessThan(1200);
    expect(run([{ type: 'undo' }], s).radiusM).toBeNull();
  });
  it('Escape cancels the draft, then the tool', () => {
    const s = run([{ type: 'select', tool: 'distance' }, { type: 'click', point: [0, 0] }]);
    const cancelled = run([{ type: 'cancel' }], s);
    expect(cancelled).toMatchObject({ tool: 'distance', points: [] });
    expect(run([{ type: 'cancel' }], cancelled)).toEqual(initialToolState);
  });
  it('a pin click places the pin; pan ignores clicks', () => {
    const s = run([{ type: 'select', tool: 'pin' }, { type: 'click', point: [3, 4] }]);
    expect(draftShape(s)).toEqual({ kind: 'pin', point: [3, 4] });
    expect(run([{ type: 'click', point: [1, 1] }])).toEqual(initialToolState);
  });
});

describe('featureFromDraft', () => {
  it('builds each kind; an area over 200 km is refused', () => {
    const circle = featureFromDraft({ kind: 'circle', center: [0, 0], radiusM: 500 }, 1);
    expect('feature' in circle && circle.feature.properties).toMatchObject({ kind: 'circle', radiusM: 500, center: [0, 0] });
    expect('feature' in circle && circle.feature.geometry.type === 'Polygon' && circle.feature.geometry.coordinates[0]).toHaveLength(129);
    expect(featureFromDraft({ kind: 'area', points: [[0, 0], [3, 0], [3, 3]] }, 1)).toEqual({ error: 'Areas up to 200 km across.' });
    const area = featureFromDraft({ kind: 'area', points: [[0, 0], [0.1, 0], [0.1, 0.1]] }, 2);
    expect('feature' in area && area.feature.geometry.type === 'Polygon' && area.feature.geometry.coordinates[0]).toHaveLength(4);
  });
});
