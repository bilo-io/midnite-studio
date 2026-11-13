// @vitest-environment node
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { GAME_LEVEL_PARAM, levelEntityToWorld } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The kit's level loader (Phase 132 Theme C), imported straight from `templates/media-game/kit/core/` like
 * `kit-core.test.ts`: plain JS in the files every game gets, no browser capability needed. The agreement test
 * at the end pins the kit's `toWorld3d` to shared's `levelEntityToWorld`, which the editor's inspector shows.
 */
const coreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);

const prop = (name: string, value: unknown, type = 'string') => ({ name, type, value });

const map3d = (mpt = 1) => ({
  type: 'map',
  orientation: 'orthogonal',
  infinite: false,
  width: 10,
  height: 10,
  tilewidth: 32,
  tileheight: 32,
  tilesets: [],
  properties: [prop('midnite.dimension', '3d'), prop('midnite.metresPerTile', mpt, 'float')],
  layers: [
    {
      id: 1,
      type: 'objectgroup',
      name: 'objects',
      objects: [
        { id: 1, name: 'start', class: 'spawn', x: 64, y: 96, width: 0, height: 0, point: true },
        { id: 2, name: 'wall', type: 'prop', x: 32, y: 32, width: 64, height: 32, rotation: 0, properties: [prop('sizeY', 4, 'float'), prop('elevation', 1, 'float')] },
        { id: 3, name: 'ramp', type: 'prop', x: 96, y: 64, width: 64, height: 32, rotation: 90, properties: [prop('pitch', 15, 'float'), prop('scale', 2, 'float')] },
        { id: 4, name: 'route', type: 'path', x: 32, y: 32, width: 0, height: 0, polyline: [{ x: 0, y: 0 }, { x: 32, y: 64 }] },
      ],
    },
    { id: 2, type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [1, 0, 2, 0, 3, 0] },
  ],
});

describe('kit/core/level.js', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('currentLevel reads the runner query and rejects anything that is not a scene name', async () => {
    const { currentLevel, LEVEL_PARAM, isSceneName } = await load('level.js');
    expect(LEVEL_PARAM).toBe(GAME_LEVEL_PARAM);
    expect(currentLevel('level', '?midnite-level=cave')).toBe('cave');
    expect(currentLevel('level', '?midnite-deterministic=1&midnite-level=cave-2_b')).toBe('cave-2_b');
    expect(currentLevel('level', '')).toBe('level');
    for (const bad of ['../x', 'Cave', 'a b', '', '-x', 'a'.repeat(65)]) {
      expect(isSceneName(bad)).toBe(false);
      expect(currentLevel('level', `?midnite-level=${encodeURIComponent(bad)}`)).toBe('level');
    }
  });

  it('levelUrl and fetchLevel address levels/<name>.tmj, and a 404 says which level is missing', async () => {
    const { levelUrl, fetchLevel } = await load('level.js');
    expect(levelUrl('cave')).toBe('levels/cave.tmj');
    const fetchMock = vi.fn(async (url: string) => (url === 'levels/cave.tmj' ? { ok: true, json: async () => ({ type: 'map' }) } : { ok: false }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchLevel('cave')).resolves.toEqual({ type: 'map' });
    await expect(fetchLevel('nope')).rejects.toThrow('Level "nope" not found in levels/.');
    await expect(fetchLevel('../x')).rejects.toThrow('not a scene name');
  });

  it('levelEntities falls back to class, keeps properties and polylines; levelGrid makes rows', async () => {
    const { levelEntities, levelGrid, levelProps } = await load('level.js');
    const entities = levelEntities(map3d());
    expect(entities.map((e: { type: string }) => e.type)).toEqual(['spawn', 'prop', 'prop', 'path']);
    expect(entities[1].properties).toEqual({ sizeY: 4, elevation: 1 });
    expect(entities[3].polyline).toEqual([{ x: 0, y: 0 }, { x: 32, y: 64 }]);
    expect(levelEntities(map3d(), 'missing')).toEqual([]);
    expect(levelGrid(map3d(), 'ground')).toEqual([[1, 0, 2], [0, 3, 0]]);
    expect(levelGrid(map3d(), 'missing')).toEqual([]);
    expect(levelProps(map3d())).toEqual({ 'midnite.dimension': '3d', 'midnite.metresPerTile': 1 });
  });

  it('re-exports the existing Tiled readers so a starter imports one module', async () => {
    const level = await load('level.js');
    const objects = await load('tiled-objects.js');
    expect(level.tiledObjects).toBe(objects.tiledObjects);
    expect(level.collisionGrid).toBe(objects.collisionGrid);
  });

  it.each([1, 2])('toWorld3d equals shared levelEntityToWorld (metresPerTile %i)', async (mpt) => {
    const { levelEntities, toWorld3d } = await load('level.js');
    const map = map3d(mpt);
    const raw = (map.layers[0] as { objects: Parameters<typeof levelEntityToWorld>[0][] }).objects;
    const entities = levelEntities(map);
    expect(entities).toHaveLength(raw.length);
    entities.forEach((entity: unknown, i: number) => {
      expect(toWorld3d(entity, map)).toEqual(levelEntityToWorld(raw[i]!, map));
    });
    // A point, a rotated rectangle and the elevation default, spelled out.
    const [spawn, wall, ramp] = entities.map((e: unknown) => toWorld3d(e, map));
    expect(spawn.position).toEqual([(64 / 32) * mpt, null, (96 / 32) * mpt]);
    expect(wall.position[1]).toBe(1);
    expect(wall.size).toEqual([2 * mpt, 4, 1 * mpt]);
    // Rotated 90 degrees clockwise about its origin (96, 64): the centre (+32, +16) lands at (96 - 16, 64 + 32).
    expect(ramp.position[0]).toBeCloseTo((80 / 32) * mpt, 9);
    expect(ramp.position[2]).toBeCloseTo((96 / 32) * mpt, 9);
    expect(ramp.yaw).toBeCloseTo(-Math.PI / 2, 9);
    expect(ramp.scale).toBe(2);
  });
});

describe('kit/core/hook.js goto', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rewrites the query with midnite-level, keeps determinism params, and refuses a bad name', async () => {
    const replace = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search: '?midnite-deterministic=1&midnite-seed=7&midnite-level=old', pathname: '/index.html', hash: '', replace });
    const { installHook } = await load('hook.js');
    const hook = installHook();
    expect(hook.goto('cave')).toBe(true);
    expect(replace).toHaveBeenCalledWith('/index.html?midnite-deterministic=1&midnite-seed=7&midnite-level=cave');
    replace.mockClear();
    expect(hook.goto('../etc')).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
