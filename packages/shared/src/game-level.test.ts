import { describe, expect, it } from 'vitest';

import { GameLevelSchema, GAME_LEVEL_PROPS, levelEntityToWorld, levelOrigin, levelPixelsToWorld, levelWorldToPixels, levelProperties, metresPerTile, parseGameLevel, terrainExtent, terrainPlacements } from './game-level';
import { GameManifestSchema, GameSceneNameSchema } from './media-game';
import { buildTmj, buildTsj, TiledMapSchema } from './sprite/tiled';

const tsj = buildTsj({
  name: 'tiles',
  tiles: [{ id: 0, collision: 'solid' }, { id: 1, collision: 'walkable' }],
  tileWidth: 32,
  tileHeight: 32,
  columns: 2,
  imageWidth: 64,
  imageHeight: 32,
  scheme: 'corner16',
  baseTile: { a: 0 },
  sets: [],
});

const sprites2d = () =>
  buildTmj({
    orientation: 'orthogonal',
    width: 3,
    height: 2,
    tileWidth: 32,
    tileHeight: 32,
    tileset: tsj,
    layers: [{ name: 'ground', data: [0, 1, 0, 1, 0, 1] }],
    objects: [{ name: 'start', type: 'spawn', x: 16, y: 16 }],
  });

const prop = (name: string, value: unknown, type = 'string') => ({ name, type, value });
const level3d = (mpt?: number) => ({
  ...sprites2d(),
  properties: [prop('midnite.dimension', '3d'), ...(mpt === undefined ? [] : [prop('midnite.metresPerTile', mpt, 'float')])],
});

describe('parseGameLevel', () => {
  it('reads a Sprites buildTmj map as a 2D level, and the same map still passes the strict Tiled schema', () => {
    const map = sprites2d();
    expect(() => TiledMapSchema.parse(map)).not.toThrow();
    const parsed = parseGameLevel(map);
    expect(parsed.ok && parsed.dimension).toBe('2d');
  });

  it('reads midnite.dimension 3d', () => {
    const parsed = parseGameLevel(level3d());
    expect(parsed.ok && parsed.dimension).toBe('3d');
  });

  it('keeps fields it never writes, so a map saved by Tiled round-trips', () => {
    const parsed = parseGameLevel({ ...sprites2d(), backgroundcolor: '#112233', editorsettings: { export: {} }, layers: [{ type: 'imagelayer', name: 'sky', image: 'sky.png' }] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.level).toMatchObject({ backgroundcolor: '#112233', editorsettings: { export: {} } });
      expect(parsed.level.layers[0]).toMatchObject({ type: 'imagelayer', image: 'sky.png' });
    }
  });

  it('reports an external tileset, an infinite map and a layer without data', () => {
    const external = parseGameLevel({ ...sprites2d(), tilesets: [{ firstgid: 1, source: 'sets/tiles.tsj' }] });
    expect(external).toMatchObject({ ok: false });
    expect(!external.ok && external.issues[0]?.message).toBe('Tileset "sets/tiles.tsj" is external. Embed it (Tiled ▸ Map ▸ Embed Tileset) and save again.');

    const infinite = parseGameLevel({ ...sprites2d(), infinite: true });
    expect(!infinite.ok && infinite.issues[0]?.message).toBe('Infinite maps are not supported. Turn off “Infinite” in the map’s properties in Tiled and save again.');

    const bare = parseGameLevel({ ...sprites2d(), layers: [{ type: 'tilelayer', name: 'ground' }] });
    expect(!bare.ok && bare.issues[0]?.message).toContain('has no data');

    expect(parseGameLevel(null)).toMatchObject({ ok: false });
    expect(parseGameLevel('x')).toMatchObject({ ok: false });
  });

  it('never throws on a hostile value', () => {
    for (const value of [undefined, 1, [], { type: 'map' }, { type: 'map', layers: 'x' }]) expect(() => parseGameLevel(value)).not.toThrow();
    expect(GameLevelSchema.safeParse({}).success).toBe(false);
  });
});

describe('scene names and the manifest', () => {
  it('accepts lowercase scene names and refuses the rest', () => {
    for (const ok of ['level', 'cave-2', 'a_b', '0']) expect(GameSceneNameSchema.safeParse(ok).success).toBe(true);
    for (const bad of ['', 'Cave', '../x', 'a/b', '-a', 'a.b', 'a'.repeat(65)]) {
      const result = GameSceneNameSchema.safeParse(bad);
      expect(result.success).toBe(false);
    }
    const message = GameSceneNameSchema.safeParse('Cave');
    expect(!message.success && message.error.issues[0]?.message).toBe('use lowercase letters, digits, - and _');
  });

  it('GameManifestSchema takes an optional levels key', () => {
    const base = { version: 1, name: 'g', engine: 'phaser', dimension: '2d', perspective: 'platformer', genre: null, starter: 'blank', kitVersion: '0.12.0' };
    expect(GameManifestSchema.safeParse(base).success).toBe(true);
    const withLevels = GameManifestSchema.parse({ ...base, levels: { start: 'level' } });
    expect(withLevels.levels).toEqual({ dir: 'levels', start: 'level' });
    expect(GameManifestSchema.safeParse({ ...base, levels: { start: 'Bad' } }).success).toBe(false);
  });
});

describe('levelEntityToWorld', () => {
  const level = (mpt?: number) => ({ tilewidth: 32, tileheight: 32, properties: mpt === undefined ? [] : [prop('midnite.metresPerTile', mpt, 'float')] });

  it('maps a point to metres with the ground-snap elevation unset', () => {
    const world = levelEntityToWorld({ x: 64, y: 96 }, level());
    expect(world.position).toEqual([2, null, 3]);
    expect(world.yaw).toBeCloseTo(0, 9);
    expect(world.size).toEqual([0, 3, 0]);
    expect(world.scale).toBe(1);
  });

  it('puts a rectangle at its centre, rotated clockwise about its own origin, with yaw negated', () => {
    const world = levelEntityToWorld({ x: 96, y: 64, width: 64, height: 32, rotation: 90, properties: [prop('elevation', 1.5, 'float'), prop('sizeY', 5, 'float'), prop('pitch', 90, 'float')] }, level());
    expect(world.position[0]).toBeCloseTo(2.5, 9);
    expect(world.position[1]).toBe(1.5);
    expect(world.position[2]).toBeCloseTo(3, 9);
    expect(world.yaw).toBeCloseTo(-Math.PI / 2, 9);
    expect(world.pitch).toBeCloseTo(Math.PI / 2, 9);
    expect(world.size).toEqual([2, 5, 1]);
  });

  it('scales every length by metresPerTile', () => {
    const world = levelEntityToWorld({ x: 64, y: 96, width: 32, height: 32 }, level(2));
    expect(world.position).toEqual([(80 / 32) * 2, null, (112 / 32) * 2]);
    expect(world.size).toEqual([2, 3, 2]);
    expect(metresPerTile(level(2))).toBe(2);
    expect(metresPerTile(level(0))).toBe(1);
    expect(metresPerTile(level())).toBe(1);
  });

  it('levelProperties keeps the first of a repeated name', () => {
    expect(levelProperties({ properties: [prop('a', 1), prop('a', 2), prop('b', 3)] })).toEqual({ a: 1, b: 3 });
  });
});

describe('level origin (midnite.originX / originY)', () => {
  const at = (ox?: number, oz?: number, mpt = 1) => ({
    tilewidth: 32,
    tileheight: 32,
    properties: [
      ...(ox === undefined ? [] : [prop(GAME_LEVEL_PROPS.originX, ox, 'float')]),
      ...(oz === undefined ? [] : [prop(GAME_LEVEL_PROPS.originY, oz, 'float')]),
      prop(GAME_LEVEL_PROPS.metresPerTile, mpt, 'float'),
    ],
  });

  it('names the properties', () => {
    expect(GAME_LEVEL_PROPS.originX).toBe('midnite.originX');
    expect(GAME_LEVEL_PROPS.originY).toBe('midnite.originY');
  });

  it('defaults to 0 and reads a non-number as 0, so a level without them is unchanged', () => {
    expect(levelOrigin(at())).toEqual({ x: 0, z: 0 });
    expect(levelOrigin({ properties: [prop(GAME_LEVEL_PROPS.originX, 'far')] })).toEqual({ x: 0, z: 0 });
    expect(levelEntityToWorld({ x: 64, y: 96 }, at()).position).toEqual([2, null, 3]);
    expect(levelEntityToWorld({ x: 64, y: 96 }, at(0, 0)).position).toEqual([2, null, 3]);
  });

  it('is the world position of the top-left corner: world = origin + px / tile × mpt', () => {
    expect(levelEntityToWorld({ x: 64, y: 96 }, at(-1950, -2145)).position).toEqual([-1948, null, -2142]);
    expect(levelEntityToWorld({ x: 64, y: 96, width: 32, height: 32 }, at(100, 50, 2)).position).toEqual([100 + (80 / 32) * 2, null, 50 + (112 / 32) * 2]);
    expect(levelEntityToWorld({ x: 0, y: 0, width: 32, height: 32 }, at(10, 20)).size).toEqual([1, 3, 1]);
  });

  it('converts pixels to world and back', () => {
    const lvl = at(-1950, -2145, 2);
    const [x, z] = levelPixelsToWorld(lvl, 48, 80);
    expect([x, z]).toEqual([-1950 + 3, -2145 + 5]);
    expect(levelWorldToPixels(lvl, x, z)).toEqual({ x: 48, y: 80 });
    expect(levelWorldToPixels(at(), 2, 3)).toEqual({ x: 64, y: 96 });
  });

  it('survives a parse and serialise round trip untouched', () => {
    const map = { ...sprites2d(), properties: [prop('midnite.dimension', '3d'), prop(GAME_LEVEL_PROPS.originX, -5000, 'float'), prop(GAME_LEVEL_PROPS.originY, 5000, 'float')] };
    const parsed = parseGameLevel(JSON.parse(JSON.stringify(map)));
    expect(parsed.ok && levelOrigin(parsed.level)).toEqual({ x: -5000, z: 5000 });
    expect(parsed.ok && JSON.parse(JSON.stringify(parsed.level)).properties).toEqual(map.properties);
  });
});

describe('terrain packs round a level terrain', () => {
  it('reads the placements a level lists and leaves out what it cannot use', () => {
    const ok = { name: 'north', minX: -10, minZ: 0, maxX: 10, maxZ: 20 };
    expect(terrainPlacements(JSON.stringify([ok, { name: 'flat', minX: 0, minZ: 0, maxX: 0, maxZ: 5 }, { name: '', minX: 0, minZ: 0, maxX: 1, maxZ: 1 }, { name: 'text', minX: '0', minZ: 0, maxX: 1, maxZ: 1 }, null]))).toEqual([ok]);
    expect(terrainPlacements('not json')).toEqual([]);
    expect(terrainPlacements('{"name":"north"}')).toEqual([]);
    expect(terrainPlacements(undefined)).toEqual([]);
    expect(terrainPlacements(JSON.stringify(Array.from({ length: 20 }, () => ok)))).toHaveLength(8);
  });
  it('spans the terrain and every pack', () => {
    const terrain = { minX: -5, minZ: -5, maxX: 5, maxZ: 5 };
    expect(terrainExtent(terrain)).toEqual(terrain);
    expect(terrainExtent({ ...terrain, packs: [{ minX: -9, minZ: 0, maxX: 2, maxZ: 30 }] })).toEqual({ minX: -9, minZ: -5, maxX: 5, maxZ: 30 });
  });
});
