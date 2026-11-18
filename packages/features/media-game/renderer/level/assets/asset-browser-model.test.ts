import { describe, expect, it } from 'vitest';

import { ASSET_KIND_CHIPS, filterAssets, moveTileFocus, placeableAssets } from './asset-browser-model';

const a = (name: string, kind: string) => ({ name, kind: kind as 'model', path: `assets/${name}`, sha256: 's' });

describe('asset browser model', () => {
  it('C1: matches name substrings case-insensitively and respects kind chips', () => {
    const list = [a('Tree.glb', 'model'), a('treehouse.png', 'sprite'), a('rock.glb', 'model'), a('bg.png', 'background')];
    const all = new Set<string>(ASSET_KIND_CHIPS);
    expect(filterAssets(list, 'TREE', all).map((x) => x.name)).toEqual(['Tree.glb', 'treehouse.png']);
    expect(filterAssets(list, 'tree', new Set(['model'])).map((x) => x.name)).toEqual(['Tree.glb']);
    expect(filterAssets(list, '', new Set(['background'])).map((x) => x.name)).toEqual(['bg.png']);
    expect(filterAssets(list, '', new Set())).toEqual([]);
  });

  it('lists only placeable kinds, in manifest order', () => {
    expect(placeableAssets([a('m', 'model'), a('s', 'audio'), a('t', 'tileset'), a('x', 'terrain')]).map((x) => x.name)).toEqual(['m', 't']);
  });

  it('moves tile focus by arrows and clamps at the ends', () => {
    expect(moveTileFocus(0, 'ArrowRight', 4, 10)).toBe(1);
    expect(moveTileFocus(1, 'ArrowDown', 4, 10)).toBe(5);
    expect(moveTileFocus(8, 'ArrowDown', 4, 10)).toBe(9);
    expect(moveTileFocus(0, 'ArrowLeft', 4, 10)).toBe(0);
    expect(moveTileFocus(2, 'a', 4, 10)).toBe(2);
  });
});
