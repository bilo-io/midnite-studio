import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { KitGameStateSchema } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The engine-free half of the game kit (Phase 107 Theme E), imported straight
 * from `templates/media-game/kit/core/` — the files every game repo gets. The
 * Phaser half (`kit/phaser/`) needs a real canvas and is covered by e2e.
 *
 * Imported by URL rather than by specifier: the kit is plain JS outside this
 * package, with no type declarations for `tsc` to resolve.
 */

const coreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);

const corridor = (): number[][] => [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

describe('kit/core/iso.js', () => {
  it('screenToIso inverts isoToScreen', async () => {
    const { isoToScreen, screenToIso } = await load('iso.js');
    for (const [x, y] of [[0, 0], [3, 7], [2.5, 1.25], [-4, 9]] as const) {
      const screen = isoToScreen(x, y, 64, 32);
      const back = screenToIso(screen.x, screen.y, 64, 32);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
    }
  });

  it('picks the tile under a point, and nothing off the map', async () => {
    const { isoToScreen, pickTile } = await load('iso.js');
    // The centre of tile (3, 2) is half a tile below its top corner.
    const top = isoToScreen(3, 2, 64, 32);
    expect(pickTile(top.x, top.y + 16, 64, 32, { width: 8, height: 8 })).toEqual({ x: 3, y: 2 });
    expect(pickTile(-500, -500, 64, 32, { width: 8, height: 8 })).toBeNull();
  });

  it('sorts further-down tiles later, height breaking ties', async () => {
    const { isoDepth } = await load('iso.js');
    expect(isoDepth(2, 2)).toBeGreaterThan(isoDepth(1, 2));
    expect(isoDepth(1, 1, 1)).toBeGreaterThan(isoDepth(1, 1, 0));
  });
});

describe('kit/core/raycast.js', () => {
  it('a ray down an 8-cell corridor hits the end wall at 7.5', async () => {
    const { castRay } = await load('raycast.js');
    const hit = castRay(corridor(), { x: 1.5, y: 1.5 }, { x: 1, y: 0 });
    expect(hit.hit).toBe(true);
    expect(Math.abs(hit.distance - 7.5)).toBeLessThan(1e-9);
    expect(hit).toMatchObject({ side: 0, cellX: 9, cellY: 1, cell: 1 });
    expect(hit.wallX).toBeCloseTo(0.5, 9);
  });

  it('hits a side wall on an east-west face, and misses off the map', async () => {
    const { castRay } = await load('raycast.js');
    const side = castRay(corridor(), { x: 1.5, y: 1.5 }, { x: 0, y: 1 });
    expect(side).toMatchObject({ hit: true, side: 1, cellX: 1, cellY: 2 });
    expect(side.distance).toBeCloseTo(0.5, 9);
    const open = castRay([[0, 0, 0]], { x: 0.5, y: 0.5 }, { x: 1, y: 0 });
    expect(open.hit).toBe(false);
  });

  it('treats a closed door as solid and an open one as empty', async () => {
    const { castRay } = await load('raycast.js');
    const map = corridor();
    map[1]![5] = 9;
    const closed = castRay(map, { x: 1.5, y: 1.5 }, { x: 1, y: 0 });
    expect(closed).toMatchObject({ cellX: 5, cell: 9 });
    const open = castRay(map, { x: 1.5, y: 1.5 }, { x: 1, y: 0 }, { isSolid: (cell: number) => cell !== 0 && cell !== 9 });
    expect(open.cellX).toBe(9);
  });

  it('castRays has no fisheye: a flat wall is equidistant across the view', async () => {
    const { castRays } = await load('raycast.js');
    const room = Array.from({ length: 21 }, (_, y) => Array.from({ length: 21 }, (_, x) => (x === 20 || y === 0 || y === 20 || x === 0 ? 1 : 0)));
    const hits = castRays(room, { x: 10.5, y: 10.5 }, 0, 66, 9);
    expect(hits).toHaveLength(9);
    for (const hit of hits) expect(hit.distance).toBeCloseTo(9.5, 9);
  });

  it('projects a billboard in front to the centre column, and drops one behind', async () => {
    const { projectSprite } = await load('raycast.js');
    const ahead = projectSprite({ x: 1, y: 1 }, 0, 66, { x: 4, y: 1 }, 320);
    expect(ahead.screenX).toBeCloseTo(160, 9);
    expect(ahead.depth).toBeCloseTo(3, 9);
    expect(projectSprite({ x: 1, y: 1 }, 0, 66, { x: -2, y: 1 }, 320)).toBeNull();
  });
});

describe('kit/core/anim-names.js', () => {
  // Phase 106 `anims.json` fixtures: one drawn in 8 directions, one in 4, one in 1.
  const eight = { anims: ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'].map((dir) => ({ key: `hero/walk/${dir}` })) };
  const four = { anims: ['e', 's', 'w', 'n'].map((dir) => ({ key: `hero/walk/${dir}` })) };

  it('picks se on an 8-direction atlas and e on a 4-direction one', async () => {
    const { animName, animKeysFromJSON } = await load('anim-names.js');
    expect(animName('hero', 'walk', [1, 1], animKeysFromJSON(eight))).toBe('hero/walk/se');
    expect(animName('hero', 'walk', [1, 1], animKeysFromJSON(four))).toBe('hero/walk/e');
    expect(animName('hero', 'walk', [0, -1], animKeysFromJSON(four))).toBe('hero/walk/n');
    expect(animName('hero', 'walk', [-1, 0.2], animKeysFromJSON(eight))).toBe('hero/walk/w');
  });

  it('falls back to a one-direction clip, and to null for a missing one', async () => {
    const { animName } = await load('anim-names.js');
    expect(animName('coin', 'spin', [1, 0], ['coin/spin'])).toBe('coin/spin');
    expect(animName('hero', 'jump', [1, 0], ['hero/walk/e'])).toBeNull();
  });

  it('builds animations from Aseprite frame tags when there is no anims.json', async () => {
    const { asepriteAnimDefs } = await load('anim-names.js');
    const atlas = {
      frames: { 'hero 0': { duration: 100 }, 'hero 1': { duration: 100 }, 'hero 2': { duration: 50 }, 'hero 3': { duration: 50 } },
      meta: { frameTags: [{ name: 'idle/s', from: 0, to: 1 }, { name: 'walk/s', from: 2, to: 3 }] },
    };
    expect(asepriteAnimDefs('hero', atlas)).toEqual([
      { key: 'hero/idle/s', frames: ['hero 0', 'hero 1'], frameRate: 10, repeat: -1 },
      { key: 'hero/walk/s', frames: ['hero 2', 'hero 3'], frameRate: 20, repeat: -1 },
    ]);
  });
});

describe('kit/core/input-map.js', () => {
  it('justPressed fires once per press, through keys, the gamepad or the virtual pad', async () => {
    const { createInputMap, virtualGamepad } = await load('input-map.js');
    const down = new Set<string>();
    const pad = new Set<number>();
    const map = createInputMap(
      { jump: { keys: ['SPACE'], gamepad: [0] }, left: { keys: ['LEFT'] }, right: { keys: ['RIGHT'] } },
      { isKeyDown: (key: string) => down.has(key), isGamepadDown: (button: number) => pad.has(button) },
    );
    const frames: boolean[] = [];
    for (const pressed of [false, true, true, true, false, true]) {
      if (pressed) down.add('SPACE');
      else down.delete('SPACE');
      map.update();
      frames.push(map.justPressed('jump'));
    }
    expect(frames).toEqual([false, true, false, false, false, true]);

    down.clear();
    map.update();
    pad.add(0);
    map.update();
    expect(map.justPressed('jump')).toBe(true);
    pad.clear();
    map.update();
    virtualGamepad.set(0, true);
    map.update();
    expect(map.isDown('jump')).toBe(true);
    virtualGamepad.clear();
  });

  it('axis and an 8-way vector with normalised diagonals', async () => {
    const { createInputMap } = await load('input-map.js');
    const down = new Set(['RIGHT', 'DOWN']);
    const map = createInputMap(
      { left: { keys: ['LEFT'] }, right: { keys: ['RIGHT'] }, up: { keys: ['UP'] }, down: { keys: ['DOWN'] } },
      { isKeyDown: (key: string) => down.has(key) },
    );
    map.update();
    expect(map.axis('left', 'right')).toBe(1);
    const v = map.vector();
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 12);
  });
});

describe('kit/core/jump.js', () => {
  const cfg = { coyoteMs: 100, jumpBufferMs: 120, jumpVelocity: -460, jumpCut: 0.5 };
  const step = (over: Partial<{ onGround: boolean; pressed: boolean; held: boolean; vy: number }>) => ({
    dtMs: 16, onGround: false, pressed: false, held: false, vy: 0, ...over,
  });

  it('allows a jump within coyote time after leaving a ledge, not after', async () => {
    const { createJumpController } = await load('jump.js');
    const late = createJumpController(cfg);
    late.update(step({ onGround: true }));
    for (let i = 0; i < 4; i += 1) late.update(step({})); // 64 ms airborne
    expect(late.update(step({ pressed: true, held: true })).jumped).toBe(true);

    const tooLate = createJumpController(cfg);
    tooLate.update(step({ onGround: true }));
    for (let i = 0; i < 8; i += 1) tooLate.update(step({})); // 128 ms airborne
    expect(tooLate.update(step({ pressed: true, held: true })).jumped).toBe(false);
  });

  it('buffers a press made just before landing', async () => {
    const { createJumpController } = await load('jump.js');
    const jump = createJumpController(cfg);
    jump.update(step({ pressed: true, held: true, vy: 200 }));
    jump.update(step({ held: true, vy: 200 }));
    expect(jump.update(step({ onGround: true, held: true }))).toEqual({ vy: -460, jumped: true });
  });

  it('cuts the jump short once when the button is released while rising', async () => {
    const { createJumpController } = await load('jump.js');
    const jump = createJumpController(cfg);
    jump.update(step({ onGround: true, pressed: true, held: true }));
    expect(jump.update(step({ held: false, vy: -300 })).vy).toBe(-150);
    expect(jump.update(step({ held: false, vy: -140 })).vy).toBe(-140);
  });
});

describe('kit/core/rng.js and clock.js', () => {
  it('the same seed gives the same sequence; reseeding restarts it', async () => {
    const { createRng } = await load('rng.js');
    const a = createRng(42);
    const b = createRng(42);
    const first = [a.next(), a.next(), a.int(1, 6)];
    expect([b.next(), b.next(), b.int(1, 6)]).toEqual(first);
    a.reseed(42);
    expect(a.next()).toBe(first[0]);
    for (let i = 0; i < 100; i += 1) {
      const n = a.int(1, 6);
      expect(n >= 1 && n <= 6 && Number.isInteger(n)).toBe(true);
    }
  });

  it('advances in fixed steps, caps a stall, and steps exactly while paused', async () => {
    const { createClock } = await load('clock.js');
    const clock = createClock({ stepMs: 10, maxStepsPerFrame: 3 });
    expect(clock.advance(25)).toBe(2);
    expect(clock.advance(5)).toBe(1); // 5 left over + 5
    expect(clock.advance(1000)).toBe(3);
    clock.pause();
    expect(clock.advance(100)).toBe(0);
    expect(clock.step(4)).toBe(4);
    expect(clock.frame).toBe(10);
    expect(clock.time).toBe(100);
  });
});

describe('kit/core/tiled-objects.js', () => {
  const map = {
    width: 3,
    layers: [
      { type: 'tilelayer', name: 'collision', width: 3, data: [1, 0, 1, 0, 0, 2] },
      {
        type: 'objectgroup',
        name: 'objects',
        objects: [
          { name: 'player', type: 'spawn', x: 16, y: 32, properties: [{ name: 'facing', value: 'e' }] },
          { name: 'door', class: 'exit', x: 48, y: 32, width: 16, height: 16 },
          { name: 'chest', type: 'item', x: 8, y: 8 },
        ],
      },
    ],
  };

  it('splits the objects layer into spawns, exits and named points', async () => {
    const { tiledObjects } = await load('tiled-objects.js');
    const objects = tiledObjects(map);
    expect(objects.spawns).toEqual([{ name: 'player', type: 'spawn', x: 16, y: 32, width: 0, height: 0, properties: { facing: 'e' } }]);
    expect(objects.exits.map((o: { name: string }) => o.name)).toEqual(['door']);
    expect(Object.keys(objects.points)).toEqual(['chest']);
    expect(tiledObjects({})).toEqual({ spawns: [], exits: [], points: {} });
  });

  it('reads the collision layer as a 0/1 grid', async () => {
    const { collisionGrid } = await load('tiled-objects.js');
    expect(collisionGrid(map)).toEqual([[1, 0, 1], [0, 0, 1]]);
  });
});

describe('kit/core/save.js and asset-index.js', () => {
  it('saves under midnite:<game>:<slot> and lists only this game', async () => {
    const { createSaveStore } = await load('save.js');
    const data = new Map<string, string>([['other:key', 'x']]);
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
    };
    const saves = createSaveStore({ gameName: 'moon-rover', storage });
    expect(saves.save('slot1', { level: 2 })).toBe(true);
    expect(data.get('midnite:moon-rover:slot1')).toBe('{"level":2}');
    expect(saves.load('slot1')).toEqual({ level: 2 });
    expect(saves.list()).toEqual(['slot1']);
    saves.remove('slot1');
    expect(saves.load('slot1')).toBeNull();
    expect(saves.persistent).toBe(false);
  });

  it('reads keepSaveData from the manifest, false when it cannot', async () => {
    const { readKeepSaveData } = await load('save.js');
    expect(await readKeepSaveData(async () => ({ ok: true, json: async () => ({ keepSaveData: true }) }))).toBe(true);
    expect(await readKeepSaveData(async () => ({ ok: false, json: async () => null }))).toBe(false);
    expect(await readKeepSaveData(async () => Promise.reject(new Error('offline')))).toBe(false);
  });

  it('looks assets up by kind and name', async () => {
    const { createAssetIndex } = await load('asset-index.js');
    const index = createAssetIndex({ version: 1, assets: [{ kind: 'sprite', name: 'hero', path: 'assets/sprite/hero/' }, { bad: true }] });
    expect(index.url('sprite', 'hero', 'atlas.json')).toBe('./assets/sprite/hero/atlas.json');
    expect(index.url('sprite', 'nobody')).toBeNull();
    expect(index.list('sprite')).toHaveLength(1);
  });
});

describe('kit/core/preset-defaults.js', () => {
  it('carries the documented tuning, and merges overrides per binding', async () => {
    const { PRESET_DEFAULTS, presetConfig } = await load('preset-defaults.js');
    expect(PRESET_DEFAULTS.platformer).toMatchObject({ coyoteMs: 100, jumpBufferMs: 120, gravity: 1200, jumpVelocity: -460, jumpCut: 0.5 });
    expect(PRESET_DEFAULTS.raycaster).toMatchObject({ width: 320, height: 200, fovDeg: 66 });
    const tuned = presetConfig('platformer', { coyoteMs: 80, bindings: { jump: { keys: ['X'] } } });
    expect(tuned.coyoteMs).toBe(80);
    expect(tuned.bindings.jump).toEqual({ keys: ['X'] });
    expect(tuned.bindings.left).toEqual(PRESET_DEFAULTS.platformer.bindings.left);
  });
});

describe('kit/core/hook.js', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('installs window.__midnite whose default state meets the kit contract', async () => {
    const win: Record<string, unknown> = {};
    vi.stubGlobal('window', win);
    const { installHook, HOOK_VERSION } = await load('hook.js');
    const hook = installHook();
    expect(win['__midnite']).toBe(hook);
    expect(hook.version).toBe(HOOK_VERSION);
    expect(KitGameStateSchema.safeParse(hook.getState()).success).toBe(true);
    for (const method of ['pause', 'resume', 'step', 'setSeed', 'setOverlay']) expect(typeof hook[method]).toBe('function');
  });

  it('setSeed reseeds the shared RNG as well as the game, and the pad reaches the input map', async () => {
    vi.stubGlobal('window', {});
    const { installHook } = await load('hook.js');
    const { rng } = await load('rng.js');
    const { virtualGamepad } = await load('input-map.js');
    const seen: number[] = [];
    const hook = installHook({ setSeed: (seed: number) => seen.push(seed) });
    hook.setSeed(7);
    expect(rng.seed).toBe(7);
    expect(seen).toEqual([7]);
    hook.input.gamepad(3, true);
    expect(virtualGamepad.isDown(3)).toBe(true);
    virtualGamepad.clear();
  });

  it('prints midnite-ready exactly once', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { markReady } = await load('hook.js');
    markReady();
    markReady();
    expect(log.mock.calls.filter(([line]) => line === 'midnite-ready')).toHaveLength(1);
    log.mockRestore();
  });
});
