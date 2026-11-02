import { describe, expect, it } from 'vitest';

import { clipLanes, summaryLane, timePercent, visibleLaneRange } from './clip-lanes';

describe('clip-lanes', () => {
  it('folds a bone’s tracks into one lane of sorted unique key times', () => {
    const lanes = clipLanes([
      { name: 'Hips.quaternion', times: [0, 0.5, 1] },
      { name: 'Hips.position', times: [0, 1, 0.25] },
      { name: '.bones[Head].quaternion', times: new Float32Array([0.5]) },
      { name: 'Mesh.morphTargetInfluences', times: [0] },
    ]);
    expect(lanes).toEqual([
      { bone: 'Hips', keys: [0, 0.25, 0.5, 1] },
      { bone: 'Head', keys: [0.5] },
    ]);
  });

  it('summarises every lane on one', () => {
    expect(summaryLane([{ bone: 'a', keys: [0, 1] }, { bone: 'b', keys: [1, 2] }])).toEqual({ bone: 'All 2 bones', keys: [0, 1, 2] });
  });

  it('windows a long list with overscan and clamps at both ends', () => {
    expect(visibleLaneRange(0, 64, 200, 16, 2)).toEqual({ start: 0, end: 6 });
    expect(visibleLaneRange(1600, 64, 200, 16, 2)).toEqual({ start: 98, end: 106 });
    expect(visibleLaneRange(99999, 64, 10, 16, 2)).toEqual({ start: 10, end: 10 });
  });

  it('places a time as a clamped percentage', () => {
    expect(timePercent(0.5, 2)).toBe(25);
    expect(timePercent(9, 2)).toBe(100);
    expect(timePercent(1, 0)).toBe(0);
  });
});
