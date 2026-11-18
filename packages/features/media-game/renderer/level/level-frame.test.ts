// vitest/jsdom: pure framing maths, no browser capability needed.
import { describe, expect, it } from 'vitest';

import { frameTarget, frameView, resolveIds } from './level-frame';
import { toEditLevel } from './level-edit-model';
import { blankLevel3d } from './test-helpers';

const level = () => toEditLevel(blankLevel3d())!;

describe('frameView (G2)', () => {
  it('centres a region and zooms to fit it with a 10% margin', () => {
    const view = frameView({ x: 100, y: 100, width: 200, height: 100 }, { width: 800, height: 600 });
    // 200 x 100 plus 10% each side is 240 x 120: the width is the tight one, 800 / 240.
    expect(view.zoom).toBeCloseTo(800 / 240, 5);
    expect(view.x + 200 * view.zoom).toBeCloseTo(400, 5); // the region's centre (200, 150) lands mid-canvas
    expect(view.y + 150 * view.zoom).toBeCloseTo(300, 5);
  });

  it('never zooms past 4x on a point, and a hair-thin region still frames', () => {
    expect(frameView({ x: 10, y: 10, width: 0, height: 0 }, { width: 800, height: 600 }).zoom).toBe(4);
    expect(frameView({ x: 0, y: 0, width: 1000, height: 0 }, { width: 800, height: 600 }).zoom).toBeLessThan(1);
  });
});

describe('resolveIds', () => {
  it('finds ids in any object layer and reports the rest missing', () => {
    const l = level();
    const objects = l.layers.find((x) => x.type === 'objectgroup')!;
    const id = objects.objects![0]!.id;
    const r = resolveIds(l, [id, 999, id]);
    expect(r.found).toEqual([id]);
    expect(r.missing).toEqual([999]);
    expect(r.refs).toEqual([{ layerId: objects.id, objectId: id }]);
  });
});

describe('frameTarget', () => {
  it('prefers ids, then a region, then the whole level; null when no id exists', () => {
    const l = level();
    const id = l.layers.find((x) => x.type === 'objectgroup')!.objects![0]!.id;
    expect(frameTarget(l, null, { ids: [id] })).toMatchObject({ x: expect.any(Number) });
    expect(frameTarget(l, null, { ids: [999] })).toBeNull();
    const region = { x: 1, y: 2, width: 3, height: 4 };
    expect(frameTarget(l, null, { region })).toEqual(region);
    expect(frameTarget(l, null, {})).toMatchObject({ x: 0, y: 0, width: 640, height: 640 });
  });
});
