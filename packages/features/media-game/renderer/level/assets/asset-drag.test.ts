import { afterEach, describe, expect, it } from 'vitest';

import { arm, assetDragStore, dropToObject, parseAssetDrag, placementRefusal } from './asset-drag';

afterEach(() => assetDragStore.set({ dragging: null, armed: null }));

describe('asset drag', () => {
  it('D1: dropToObject makes a prop with properties.model at the given point', () => {
    const o = dropToObject({ kind: 'asset', name: 'tree.glb', assetKind: 'model' }, { x: 96, y: 144 });
    expect(o).toMatchObject({ type: 'prop', x: 96, y: 144, name: 'tree', properties: [{ name: 'model', type: 'string', value: 'tree.glb' }] });
  });

  it('refuses a model in a 2D level and anything that is not a model', () => {
    const model = { kind: 'asset', name: 'a.glb', assetKind: 'model' } as const;
    expect(placementRefusal(model, false)).toBe('Models place in 3D levels.');
    expect(placementRefusal(model, true)).toBeNull();
    expect(placementRefusal({ kind: 'asset', name: 's.png', assetKind: 'sprite' }, true)).toBe('Only models place in a level.');
  });

  it('round-trips a payload and rejects junk', () => {
    const p = { kind: 'asset', name: 'a.glb', assetKind: 'model' } as const;
    expect(parseAssetDrag(JSON.stringify(p))).toEqual(p);
    expect(parseAssetDrag(JSON.stringify({ kind: 'prefab', name: 'wall' }))).toEqual({ kind: 'prefab', name: 'wall' });
    expect(parseAssetDrag('not json')).toBeNull();
    expect(parseAssetDrag('')).toBeNull();
  });

  it('arms and disarms', () => {
    arm({ kind: 'prefab', name: 'x' });
    expect(assetDragStore.get().armed).toEqual({ kind: 'prefab', name: 'x' });
    arm(null);
    expect(assetDragStore.get().armed).toBeNull();
  });
});
