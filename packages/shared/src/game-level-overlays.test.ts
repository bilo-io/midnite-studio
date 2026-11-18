import { describe, expect, it } from 'vitest';

import { colliderShapes, triggerShapes } from './game-level-overlays';

describe('colliderShapes and triggerShapes', () => {
  const level = {
    type: 'map', width: 2, height: 1, tilewidth: 32, tileheight: 32, orientation: 'orthogonal',
    tilesets: [{ firstgid: 1, name: 'p', image: 'p.png', tilewidth: 32, tileheight: 32, columns: 2, tiles: [{ id: 1, properties: [{ name: 'kind', type: 'string', value: 'oneway' }] }] }],
    layers: [
      { type: 'tilelayer', name: 'collision', width: 2, height: 1, data: [1, 2] },
      { type: 'objectgroup', name: 'objects', objects: [
        { id: 1, type: 'prop', x: 0, y: 0, width: 10, height: 20 },
        { id: 2, type: 'prop', x: 0, y: 0, width: 10, height: 20, properties: [{ name: 'collider', type: 'string', value: 'none' }] },
        { id: 3, type: 'exit', x: 5, y: 6 },
        { id: 4, type: 'hazard', x: 1, y: 2, width: 4, height: 4, rotation: 30 },
        { id: 5, type: 'enemy', x: 9, y: 9 },
      ] },
    ],
  };
  it('flags a one-way tile and skips colliderless props', () => {
    const shapes = colliderShapes(level);
    expect(shapes.filter((s) => s.kind === 'cell')).toEqual([{ kind: 'cell', col: 0, row: 0, oneWay: false }, { kind: 'cell', col: 1, row: 0, oneWay: true }]);
    expect(shapes.filter((s) => s.kind === 'rect').map((s) => (s as { objectId: number }).objectId)).toEqual([1]);
  });
  it('reports exit, checkpoint, trigger and hazard only', () => {
    expect(triggerShapes(level)).toEqual([
      { kind: 'point', objectId: 3, type: 'exit', x: 5, y: 6 },
      { kind: 'rect', objectId: 4, type: 'hazard', x: 1, y: 2, width: 4, height: 4, rotation: 30 },
    ]);
  });
  it('tolerates junk', () => {
    expect(colliderShapes(null)).toEqual([]);
    expect(triggerShapes({ layers: 3 })).toEqual([]);
  });
});
