// @vitest-environment node
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { GAME_KIT_VERSION, GAME_LEVEL_PARAM, GAME_SPAWN_PARAM, levelEntityToWorld } from '@midnite/studio-shared';
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

  it('toWorld3d applies midnite.originX/Y exactly as shared levelEntityToWorld does, and a map without them is unchanged', async () => {
    const { levelEntities, toWorld3d } = await load('level.js');
    const plain = map3d(2);
    const moved = { ...plain, properties: [...(plain.properties ?? []), { name: 'midnite.originX', type: 'float', value: -1950 }, { name: 'midnite.originY', type: 'float', value: -2145 }] };
    const raw = (moved.layers[0] as { objects: Parameters<typeof levelEntityToWorld>[0][] }).objects;
    levelEntities(moved).forEach((entity: unknown, i: number) => {
      expect(toWorld3d(entity, moved)).toEqual(levelEntityToWorld(raw[i]!, moved));
    });
    const [a0] = levelEntities(plain).map((e: unknown) => toWorld3d(e, plain));
    const [a1] = levelEntities(moved).map((e: unknown) => toWorld3d(e, moved));
    expect(a1.position[0]).toBeCloseTo(a0.position[0] - 1950, 9);
    expect(a1.position[2]).toBeCloseTo(a0.position[2] - 2145, 9);
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

describe('kit/core/level.js spawnOverride (Phase 140 A)', () => {
  it('parses the 2- and 3-value forms and names the param', async () => {
    const { spawnOverride, SPAWN_PARAM } = await load('level.js');
    expect(SPAWN_PARAM).toBe(GAME_SPAWN_PARAM);
    expect(spawnOverride('?midnite-spawn=120,48')).toEqual({ x: 120, y: 48 });
    expect(spawnOverride('?midnite-level=cave&midnite-spawn=12.5,0,-3')).toEqual({ x: 12.5, y: 0, z: -3 });
    expect(spawnOverride('')).toBeNull();
  });

  it('rejects NaN, infinity, extra values and an empty string, logging once', async () => {
    const { spawnOverride } = await load('level.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const bad of ['', 'a,b', '1', '1,2,3,4', '1,,2', 'NaN,1', 'Infinity,1', '1,2,x']) {
      expect(spawnOverride(`?midnite-spawn=${encodeURIComponent(bad)}`)).toBeNull();
    }
    spawnOverride('?midnite-spawn=a,b');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('a,b'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('2D: applySpawn2d moves the scene spawn, synthesises one, and is the identity without an override', async () => {
    const { applySpawn2d, tiledObjects } = await load('level.js');
    const own = tiledObjects(map3d()).spawns[0];
    expect(applySpawn2d(own, null)).toBe(own);
    expect(applySpawn2d(own, { x: 120, y: 48 })).toMatchObject({ type: 'spawn', x: 120, y: 48, name: own.name });
    expect(applySpawn2d(null, { x: 1, y: 2 })).toMatchObject({ type: 'spawn', x: 1, y: 2 });
    expect(applySpawn2d(null, null)).toBeNull();
  });

  it('3D: applySpawn3d places X,height,Z, drops onto the ground, and reads a 2-value form as X,Z', async () => {
    const { applySpawn3d } = await load('level.js');
    const ground = (x: number) => (x > 10 ? 5 : 0);
    expect(applySpawn3d([1, 0, 1], null, ground)).toEqual([1, 0, 1]);
    expect(applySpawn3d([1, 0, 1], { x: 12.5, y: 0, z: -3 }, ground)).toEqual([12.5, 5, -3]);
    expect(applySpawn3d([1, 0, 1], { x: 2, y: 8, z: 3 }, ground)).toEqual([2, 8, 3]);
    expect(applySpawn3d(null, { x: 2, y: 3 }, ground)).toEqual([2, 0, 3]);
  });
});

describe('kit entities snapshot (Phase 140 D)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('snapshotLevelEntities maps level objects with their ids, skipping layout-only types', async () => {
    const { levelEntities, snapshotLevelEntities, toWorld3d } = await load('level.js');
    const map = map3d();
    const list = levelEntities(map);
    const snaps = snapshotLevelEntities(list, { to: (e: { x: number; y: number }) => ({ x: e.x, y: e.y }) });
    expect(snaps).toEqual([
      { id: 2, type: 'prop', name: 'wall', x: 32, y: 32, alive: true },
      { id: 3, type: 'prop', name: 'ramp', x: 96, y: 64, alive: true },
    ]);
    const three = snapshotLevelEntities(list, {
      to: (e: unknown) => {
        const [x, y, z] = toWorld3d(e, map).position;
        return { x, y: y ?? 0, z };
      },
    });
    expect(three[0]).toMatchObject({ id: 2, x: 2, y: 1, z: 1.5 });
  });

  it('a live source overrides position and state; a missing answer is alive:false at the authored spot; a throw falls back', async () => {
    const { levelEntities, snapshotLevelEntities } = await load('level.js');
    const list = levelEntities(map3d());
    const to = (e: { x: number; y: number }) => ({ x: e.x, y: e.y });
    const snaps = snapshotLevelEntities(list, {
      to,
      live: (e: { id: number }) => {
        if (e.id === 2) return { x: 40, y: 50, alive: true, state: 'patrol' };
        if (e.id === 3) return null;
        throw new Error('x');
      },
    });
    expect(snaps[0]).toMatchObject({ id: 2, x: 40, y: 50, alive: true, state: 'patrol' });
    expect(snaps[1]).toMatchObject({ id: 3, x: 96, y: 64, alive: false });
  });

  it('the hook reports registered sources, replaces one by key, and survives a throwing source', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search: '', pathname: '/index.html', hash: '', replace: vi.fn() });
    const { installHook, registerEntities, KIT_VERSION } = await load('hook.js');
    expect(KIT_VERSION).toBe(GAME_KIT_VERSION);
    const hook = installHook();
    expect(hook.entities()).toEqual([]);
    registerEntities(() => [{ id: 1, type: 'a', x: 1, y: 2, alive: true }], 'one');
    registerEntities(() => {
      throw new Error('boom');
    }, 'bad');
    registerEntities(() => [{ id: null, type: 'b', x: 3, y: 4, alive: false }], 'two');
    expect(hook.entities().map((e: { type: string }) => e.type)).toEqual(['a', 'b']);
    registerEntities(() => [], 'one');
    expect(hook.entities().map((e: { type: string }) => e.type)).toEqual(['b']);
  });

  it('spawnAt reloads with the override and keeps the other params', async () => {
    const replace = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search: '?midnite-seed=7&midnite-level=cave', pathname: '/index.html', hash: '', replace });
    const { installHook } = await load('hook.js');
    const hook = installHook();
    expect(hook.spawnAt(120, 48)).toBe(true);
    expect(replace).toHaveBeenCalledWith('/index.html?midnite-seed=7&midnite-level=cave&midnite-spawn=120%2C48');
    expect(hook.spawnAt(NaN, 1)).toBe(false);
  });
});
