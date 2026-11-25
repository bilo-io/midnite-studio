// vitest: the 3D overlay data (Phase 140 Themes E to G): boxes from level items, ghost links and nav segments.
import { describe, expect, it } from 'vitest';

import { extraBoxes, ghostSegments, navSegments } from './level-extras';
import type { WorldItem } from './level-world';

const item = (id: number, over: Partial<WorldItem> = {}): WorldItem =>
  ({ index: id, sel: { layerId: 1, objectId: id }, kind: 'box', type: 'prop', position: [2, 1, 3], yaw: 0.5, pitch: 0, roll: 0, scale: 1, size: [2, 3, 4], model: null, bounds: { minX: 0, minZ: 0, maxX: 1, maxZ: 1 }, ...over }) as WorldItem;

describe('extraBoxes', () => {
  it('centres a box on its footprint, half its height up, and skips paths and other ids', () => {
    const boxes = extraBoxes([item(1), item(2, { kind: 'path' }), item(3)], [1, 2]);
    expect(boxes).toEqual([{ key: 1, position: [2, 2.5, 3], size: [2, 3, 4], yaw: 0.5 }]);
    expect(extraBoxes([item(1)], [])).toEqual([]);
  });
});

describe('ghostSegments', () => {
  it('draws authored to live for a matching id only, and nothing for a ghost on its spot', () => {
    const ghosts = [
      { key: 0, id: 1, type: 'e', alive: true, x: 5, y: 1, z: 3 },
      { key: 1, id: null, type: 'e', alive: true, x: 9, y: 9, z: 9 },
      { key: 2, id: 3, type: 'e', alive: true, x: 2, y: 1, z: 3 },
    ];
    expect(ghostSegments([item(1), item(3)], ghosts)).toEqual([2, 1, 3, 5, 1, 3]);
  });
});

describe('navSegments', () => {
  it('closes each polygon at the given height', () => {
    expect(navSegments([[[0, 0], [1, 0], [1, 1]]], 0.5)).toEqual([0, 0.5, 0, 1, 0.5, 0, 1, 0.5, 0, 1, 0.5, 1, 1, 0.5, 1, 0, 0.5, 0]);
  });
});
