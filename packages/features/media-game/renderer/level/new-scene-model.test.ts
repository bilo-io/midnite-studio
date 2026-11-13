import { parseGameLevel } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { buildBlankLevel, rewriteTilesetImages, sceneDefaults, validateSceneName } from './new-scene-model';
import type { EditLevel } from './level-edit-model';

describe('sceneDefaults', () => {
  it('prefills size, tile size and orientation by perspective', () => {
    expect(sceneDefaults('platformer')).toMatchObject({ width: 50, height: 17, tilewidth: 32, tileheight: 32 });
    expect(sceneDefaults('top-down')).toMatchObject({ width: 40, height: 30, tilewidth: 32 });
    expect(sceneDefaults('isometric')).toMatchObject({ width: 20, height: 20, tilewidth: 64, tileheight: 32, orientation: 'isometric' });
    expect(sceneDefaults('raycaster')).toMatchObject({ width: 24, height: 12, tilewidth: 64, baseLayer: 'walls' });
    expect(sceneDefaults('first-person')).toBeNull();
  });
});

describe('validateSceneName', () => {
  it('uses the manifest rule and refuses a duplicate', () => {
    expect(validateSceneName('cave-2', ['level'])).toBeNull();
    expect(validateSceneName('Cave', [])).toMatch(/lowercase/);
    expect(validateSceneName('level', ['level'])).toBe('A scene named "level" already exists.');
  });
});

describe('buildBlankLevel', () => {
  it('is a valid 2D level with a base layer, collision and one spawn', () => {
    const level = buildBlankLevel({ ...sceneDefaults('raycaster')! });
    const parsed = parseGameLevel(level);
    expect(parsed.ok && parsed.dimension).toBe('2d');
    expect(level.layers.map((l) => l.name)).toEqual(['walls', 'collision', 'objects']);
    expect(level.layers[2]!.objects).toHaveLength(1);
    expect(level.layers[2]!.objects![0]).toMatchObject({ type: 'spawn' });
  });
});

describe('rewriteTilesetImages', () => {
  it('re-roots an imported map asset\'s tileset images under levels/', () => {
    const level = { tilesets: [{ name: 'a', image: 'tiles.png' }, { name: 'b', image: './sub/b.png' }, { name: 'c', image: 'https://x/y.png' }] } as unknown as EditLevel;
    expect(rewriteTilesetImages(level, 'cave').tilesets.map((t) => t.image)).toEqual(['../assets/map/cave/tiles.png', '../assets/map/cave/sub/b.png', 'https://x/y.png']);
  });
});
