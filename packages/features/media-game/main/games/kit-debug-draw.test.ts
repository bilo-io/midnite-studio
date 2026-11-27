// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { colliderShapes, GAME_KIT_VERSION, triggerShapes } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * In-game debug draw (Phase 140 Theme G), imported straight from `templates/media-game/kit/`: the engine-free shape
 * builders, the hook's `debug()` / `navMesh()`, the nav triangles-to-polygons step, and smoke tests of the Phaser and
 * three.js drawers on stubs. The shapes must agree with the editor's View menu (`game-level-overlays.ts`).
 */
const kitDir = resolve(__dirname, '../../../../../templates/media-game/kit');
const baseDir = resolve(__dirname, '../../../../../templates/media-game/bases');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(kitDir, file)).href);
const starter = (name: string): unknown => JSON.parse(readFileSync(join(baseDir, name, 'levels/level.tmj'), 'utf8'));

afterEach(() => vi.unstubAllGlobals());

describe('kit/core/debug-shapes.js', () => {
  it('2D: every collision tile and every trigger object, agreeing with the editor overlay', async () => {
    const { debugShapes2d } = await load('core/debug-shapes.js');
    for (const name of ['platformer', 'top-down', 'isometric']) {
      const level = starter(name);
      const kit = debugShapes2d(level) as { colliders: unknown[]; triggers: unknown[] };
      expect(kit.colliders.length).toBe(colliderShapes(level).filter((s) => s.kind === 'cell').length);
      expect(kit.triggers.length).toBe(triggerShapes(level).length);
    }
  });

  it('marks a one-way tile and turns a point trigger into a marker', async () => {
    const { debugShapes2d } = await load('core/debug-shapes.js');
    const map = {
      width: 2, height: 1, tilewidth: 32, tileheight: 32, orientation: 'orthogonal',
      tilesets: [{ firstgid: 1, tiles: [{ id: 1, properties: [{ name: 'kind', value: 'oneway' }] }] }],
      layers: [
        { type: 'tilelayer', name: 'collision', width: 2, data: [1, 2] },
        { type: 'objectgroup', name: 'objects', objects: [{ id: 1, type: 'exit', x: 5, y: 6 }, { id: 2, type: 'hazard', x: 0, y: 0, width: 10, height: 10 }, { id: 3, type: 'enemy', x: 1, y: 1 }] },
      ],
    };
    const { colliders, triggers } = debugShapes2d(map);
    expect(colliders.map((c: { oneWay: boolean }) => c.oneWay)).toEqual([false, true]);
    expect(colliders[1].points).toEqual([[32, 0], [64, 0], [64, 32], [32, 32]]);
    expect(triggers.map((t: { kind: string }) => t.kind)).toEqual(['point', 'poly']);
  });

  it('3D: colliding props with a footprint, and trigger zones, in metres', async () => {
    const { debugBoxes3d } = await load('core/debug-shapes.js');
    const map = {
      width: 10, height: 10, tilewidth: 32, tileheight: 32, orientation: 'orthogonal',
      properties: [{ name: 'midnite.dimension', value: '3d' }, { name: 'midnite.metresPerTile', value: 2 }],
      layers: [{ type: 'objectgroup', name: 'objects', objects: [
        { id: 1, type: 'prop', x: 0, y: 0, width: 32, height: 64, properties: [{ name: 'sizeY', value: 4 }] },
        { id: 2, type: 'prop', x: 0, y: 0, width: 32, height: 32, properties: [{ name: 'collider', value: 'none' }] },
        { id: 3, type: 'trigger', x: 64, y: 64, width: 32, height: 32 },
        { id: 4, type: 'exit', x: 96, y: 96 },
      ] }],
    };
    const { colliders, triggers } = debugBoxes3d(map);
    expect(colliders).toHaveLength(1);
    expect(colliders[0].size).toEqual([2, 4, 4]);
    expect(triggers.map((t: { size: number[] }) => t.size)).toEqual([[2, 3, 2], [1, 1, 1]]);
  });
});

describe('kit/core/nav-policy.js trianglesToPolygons (G2)', () => {
  it('turns recast triangles into [x, z] metre polygons, dropping bad ones', async () => {
    const { trianglesToPolygons } = await load('core/nav-policy.js');
    const positions = [0, 1, 0, 4, 1, 0, 4, 1, 3, 0, 1, 3];
    const polygons = trianglesToPolygons(positions, [0, 1, 2, 0, 2, 3, 0, 1, 99]);
    expect(polygons).toEqual([
      [[0, 0], [4, 0], [4, 3]],
      [[0, 0], [4, 3], [0, 3]],
    ]);
    expect(trianglesToPolygons([], [])).toEqual([]);
  });
});

describe('the hook: debug() and navMesh() (G1)', () => {
  const setup = async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search: '', pathname: '/index.html', hash: '', replace: vi.fn() });
    const hookModule = await load('core/hook.js');
    return { hookModule, hook: hookModule.installHook() };
  };

  it('is versioned with the app', async () => {
    const { hookModule } = await setup();
    expect(hookModule.KIT_VERSION).toBe(GAME_KIT_VERSION);
    expect(GAME_KIT_VERSION).toBe('0.16.0');
  });

  it('merges partial switches, tells every drawer, and re-applies them to a drawer registered later', async () => {
    const { hookModule, hook } = await setup();
    expect(hook.debug({})).toEqual({ colliders: false, triggers: false, nav: false });
    const seen: unknown[] = [];
    hookModule.registerDebug((o: unknown) => seen.push(o), 'a');
    expect(hook.debug({ colliders: true })).toEqual({ colliders: true, triggers: false, nav: false });
    expect(hook.debug({ nav: true, colliders: 'yes' })).toEqual({ colliders: true, triggers: false, nav: true });
    expect(seen.at(-1)).toEqual({ colliders: true, triggers: false, nav: true });
    const late: unknown[] = [];
    hookModule.registerDebug((o: unknown) => late.push(o), 'b');
    expect(late).toEqual([{ colliders: true, triggers: false, nav: true }]);
    hookModule.registerDebug(() => {
      throw new Error('boom');
    }, 'bad');
    expect(() => hook.debug({ triggers: true })).not.toThrow();
    hook.debug({ colliders: false, triggers: false, nav: false });
  });

  it('navMesh() is empty without a source, reports the newest, and survives a throwing one', async () => {
    const { hookModule, hook } = await setup();
    expect(hook.navMesh()).toEqual({ polygons: [] });
    const off = hookModule.registerNavMesh(() => ({ polygons: [[[0, 0], [1, 0], [1, 1]]] }));
    expect(hook.navMesh().polygons).toHaveLength(1);
    off();
    expect(hook.navMesh()).toEqual({ polygons: [] });
    hookModule.registerNavMesh(() => {
      throw new Error('boom');
    });
    expect(hook.navMesh()).toEqual({ polygons: [] });
  });
});

describe('kit/phaser/debug-draw.js', () => {
  it('draws colliders and triggers on a Graphics only while switched on, and removes it on shutdown', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search: '', pathname: '/index.html', hash: '', replace: vi.fn() });
    const { installHook } = await load('core/hook.js');
    const { installDebugDraw2d } = await load('phaser/debug-draw.js');
    const hook = installHook();
    const calls: string[] = [];
    const graphics = new Proxy({} as Record<string, unknown>, { get: (_t, k: string) => (k === 'setDepth' ? () => graphics : (...a: unknown[]) => void calls.push(`${k}:${a.length}`) ) });
    const shutdown: Array<() => void> = [];
    const scene = { add: { graphics: () => graphics }, events: { once: (_e: string, fn: () => void) => shutdown.push(fn) } };
    const map = starter('platformer');
    installDebugDraw2d(scene, map);
    expect(calls).toEqual([]); // nothing created while off
    hook.debug({ colliders: true });
    expect(calls.filter((c) => c.startsWith('fillPoints')).length).toBeGreaterThan(0);
    hook.debug({ colliders: false });
    expect(calls).toContain('setVisible:1');
    shutdown[0]!();
    expect(calls).toContain('destroy:0');
  });
});

describe('kit/three/debug-draw.js', () => {
  it('adds one LineSegments per overlay, reads the nav-mesh from the hook and disposes them', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('location', { search: '', pathname: '/index.html', hash: '', replace: vi.fn() });
    const { installHook, registerNavMesh } = await load('core/hook.js');
    const { installDebugDraw3d } = await load('three/debug-draw.js');
    const hook = installHook();
    (globalThis as unknown as { window: Record<string, unknown> }).window.__midnite = hook;
    registerNavMesh(() => ({ polygons: [[[0, 0], [1, 0], [1, 1]]] }));
    const added: Array<{ visible: boolean; geometry: { getAttribute: (n: string) => { count: number } } }> = [];
    const scene = { add: (o: (typeof added)[number]) => added.push(o), remove: vi.fn() };
    const map = {
      width: 10, height: 10, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', properties: [{ name: 'midnite.dimension', value: '3d' }],
      layers: [{ type: 'objectgroup', name: 'objects', objects: [{ id: 1, type: 'prop', x: 0, y: 0, width: 32, height: 32 }, { id: 2, type: 'trigger', x: 64, y: 0, width: 32, height: 32 }] }],
    };
    const dispose = installDebugDraw3d(scene, map, { groundY: 0 });
    expect(added).toHaveLength(0);
    hook.debug({ colliders: true, triggers: true, nav: true });
    expect(added.length).toBe(3);
    expect(added.every((o) => o.visible)).toBe(true);
    const nav = added[added.length - 1]!;
    expect(nav.geometry.getAttribute('position').count).toBe(6); // 3 edges of the one triangle
    expect(added[0]!.geometry.getAttribute('position').count).toBe(24); // the one collider's 12 edges
    hook.debug({ nav: false });
    expect(nav.visible).toBe(false);
    dispose();
    expect(scene.remove).toHaveBeenCalledTimes(3);
  });
});
