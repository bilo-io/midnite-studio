// vitest/jsdom: pure camera maths for game_level_view presets.
import { describe, expect, it } from 'vitest';

import { boxCentre, capturePose, isoPose, levelWorldBox, selectionPose, topPose } from './level-capture-pose';

const box = { min: [0, 0, 0] as [number, number, number], max: [20, 4, 20] as [number, number, number] };

describe('capture poses', () => {
  it('top looks straight down at the middle of the level', () => {
    const p = topPose(box, 960 / 600);
    expect(p.target).toEqual([10, 0, 10]);
    expect(p.position[0]).toBeCloseTo(10);
    expect(p.position[1]).toBeGreaterThan(10);
    expect(p.position[2]).toBeCloseTo(10, 2);
  });

  it('iso looks at the level centre from 45 degrees round and 35 degrees up', () => {
    const p = isoPose(box, 960 / 600);
    const c = boxCentre(box);
    expect(p.target).toEqual(c);
    const dx = p.position[0] - c[0], dy = p.position[1] - c[1], dz = p.position[2] - c[2];
    expect(Math.atan2(dx, dz)).toBeCloseTo(Math.PI / 4, 5);
    expect(Math.atan2(dy, Math.hypot(dx, dz))).toBeCloseTo((35 * Math.PI) / 180, 5);
  });

  it('selection frames four times the largest side back', () => {
    const p = selectionPose({ min: [0, 0, 0], max: [2, 1, 1] });
    expect(Math.hypot(p.position[0] - p.target[0], p.position[1] - p.target[1], p.position[2] - p.target[2])).toBeGreaterThan(8);
  });

  it('an explicit camera wins, current has no pose, selection falls back to the level', () => {
    const camera = { position: [1, 2, 3] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    expect(capturePose({ preset: 'iso', camera, width: 960, height: 600 }, box, null)?.position).toEqual([1, 2, 3]);
    expect(capturePose({ preset: 'current', width: 960, height: 600 }, box, null)).toBeNull();
    expect(capturePose({ preset: 'selection', width: 960, height: 600 }, box, null)?.target).toEqual(boxCentre(box));
  });

  it('levelWorldBox is as tall as the tallest item', () => {
    const b = levelWorldBox({ minX: 0, minZ: 0, maxX: 5, maxZ: 5 }, 0, [{ position: [1, 2, 1], size: [1, 6, 1] }]);
    expect(b.max[1]).toBe(8);
  });
});
