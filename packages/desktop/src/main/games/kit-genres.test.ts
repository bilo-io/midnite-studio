import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The engine-free genre systems (Phase 107 Theme H), imported straight from
 * `templates/media-game/kit/core/genre/`. The scenes that use them need a real
 * canvas and are covered by composing + booting each starter in Chromium.
 */

const genreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core/genre');
const coreDir = resolve(genreDir, '..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(genreDir, file)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const loadCore = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);

const GRID = [
  [0, 0, 0, 0, 0],
  [0, 1, 1, 1, 0],
  [0, 0, 0, 1, 0],
  [1, 1, 0, 1, 0],
  [0, 0, 0, 0, 0],
];

describe('rts/astar.js', () => {
  it('finds the known shortest path on a fixture grid', async () => {
    const { astar, pathCost } = await load('rts/astar.js');
    const path = astar(GRID, { x: 0, y: 0 }, { x: 4, y: 4 });
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 4, y: 4 });
    // Straight along the top (4) then down the right edge (4): the diagonal through the
    // wall block is not allowed, so 8 orthogonal steps is optimal.
    expect(pathCost(path)).toBeCloseTo(8, 9);
    for (const c of path) expect(GRID[c.y][c.x]).toBe(0);
  });

  it('cuts corners only when both neighbours are open', async () => {
    const { astar, pathCost } = await load('rts/astar.js');
    const open = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
    expect(pathCost(astar(open, { x: 0, y: 0 }, { x: 4, y: 4 }))).toBeCloseTo(4 * Math.SQRT2, 9);
    const corner = [[0, 1], [1, 0]];
    expect(astar(corner, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('returns null when walled off or the goal is blocked', async () => {
    const { astar } = await load('rts/astar.js');
    const walled = [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ];
    expect(astar(walled, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
    expect(astar(walled, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('rts/flow-field.js', () => {
  it('points downhill everywhere reachable and agrees with A*', async () => {
    const { flowField } = await load('rts/flow-field.js');
    const { astar, pathCost } = await load('rts/astar.js');
    const field = flowField(GRID, { x: 4, y: 4 });
    for (let y = 0; y < GRID.length; y += 1) {
      for (let x = 0; x < GRID[0].length; x += 1) {
        if (GRID[y][x] === 1 || (x === 4 && y === 4)) continue;
        const d = field.dir[y][x];
        expect(d, `${x},${y}`).not.toBeNull();
        expect(field.cost[y + d.y][x + d.x]).toBeLessThan(field.cost[y][x]);
      }
    }
    expect(field.cost[0][0]).toBeCloseTo(pathCost(astar(GRID, { x: 0, y: 0 }, { x: 4, y: 4 })), 9);
  });

  it('leaves an enclosed cell unreachable', async () => {
    const { flowField } = await load('rts/flow-field.js');
    const field = flowField([[0, 1, 0]], { x: 0, y: 0 });
    expect(field.cost[0][2]).toBe(Infinity);
    expect(field.dir[0][2]).toBeNull();
  });
});

describe('rts/selection.js', () => {
  const units = [
    { id: 1, x: 1, y: 1, team: 'a' },
    { id: 2, x: 5, y: 5, team: 'a' },
    { id: 3, x: 2, y: 2, team: 'b' },
  ];

  it('box select takes units inside the rectangle, corners in any order, by team', async () => {
    const { selectInBox } = await load('rts/selection.js');
    expect(selectInBox(units, { x1: 3, y1: 3, x2: 0, y2: 0 })).toEqual([1, 3]);
    expect(selectInBox(units, { x1: 0, y1: 0, x2: 3, y2: 3 }, 'a')).toEqual([1]);
  });

  it('click select picks the nearest unit within its radius', async () => {
    const { selectAt } = await load('rts/selection.js');
    expect(selectAt(units, { x: 1.2, y: 1.1 })).toBe(1);
    expect(selectAt(units, { x: 3.5, y: 3.5 })).toBeNull();
  });

  it('control groups recall only units that are still alive', async () => {
    const { createControlGroups } = await load('rts/selection.js');
    const groups = createControlGroups();
    groups.set(1, [1, 2, 3]);
    expect(groups.recall(1, (id: number) => id !== 2)).toEqual([1, 3]);
    groups.set(1, []);
    expect(groups.recall(1)).toEqual([]);
  });
});

describe('rts/economy.js, fog.js and ai.js', () => {
  it('pays on queue, refuses when poor or supply capped, and produces in order', async () => {
    const { createEconomy, queueUnit, tickEconomy, deposit } = await load('rts/economy.js');
    const eco = createEconomy({ minerals: 150, supplyCap: 3 });
    expect(queueUnit(eco, 'worker')).toEqual({ ok: true });
    expect(eco.minerals).toBe(100);
    expect(queueUnit(eco, 'soldier')).toEqual({ ok: true });
    expect(queueUnit(eco, 'soldier')).toEqual({ ok: false, reason: 'Not enough minerals.' });
    deposit(eco, 100);
    expect(queueUnit(eco, 'soldier')).toEqual({ ok: false, reason: 'Supply capped.' });
    expect(tickEconomy(eco, 3999)).toEqual([]);
    expect(tickEconomy(eco, 1)).toEqual(['worker']);
    expect(eco.supplyUsed).toBe(1);
  });

  it('fog lights a radius, then remembers it as explored', async () => {
    const { createVisibility, fogUpdate, visibleCount, FOG } = await load('rts/fog.js');
    const vis = createVisibility(10, 10);
    fogUpdate(vis, [{ x: 2.5, y: 2.5 }], 2);
    expect(vis[2][2]).toBe(FOG.visible);
    expect(vis[9][9]).toBe(FOG.hidden);
    const lit = visibleCount(vis);
    expect(lit).toBeGreaterThan(5);
    fogUpdate(vis, [{ x: 8.5, y: 8.5 }], 2);
    expect(vis[2][2]).toBe(FOG.explored);
    expect(vis[8][8]).toBe(FOG.visible);
  });

  it('the scripted AI trains in order and attacks in waves, deterministically', async () => {
    const { createAi, aiStep } = await load('rts/ai.js');
    const run = () => {
      const ai = createAi(2, 1000);
      const log: unknown[] = [];
      for (let t = 0; t <= 2000; t += 500) {
        log.push(aiStep(ai, { time: t, minerals: 500, queueLength: 0, soldierIds: [7, 8, 9] }, { unitCost: () => 50 }));
      }
      return log;
    };
    expect(run()).toEqual(run());
    expect(run()[0]).toEqual([{ kind: 'train', type: 'worker' }]);
    expect(JSON.stringify(run())).toContain('"kind":"attack"');
  });
});

describe('arpg/loot.js', () => {
  it('10 000 rolls with seed 1 land within 1 % of the rarity weights', async () => {
    const { rollLoot, DEFAULT_TABLE, RARITY_WEIGHTS } = await load('arpg/loot.js');
    const { createRng } = await loadCore('rng.js');
    const rng = createRng(1);
    const counts: Record<string, number> = { common: 0, magic: 0, rare: 0, unique: 0 };
    for (let i = 0; i < 10_000; i += 1) counts[rollLoot(DEFAULT_TABLE, () => rng.next()).rarity] += 1;
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS) as [string, number][]) {
      expect(Math.abs((counts[rarity] ?? 0) / 100 - weight), rarity).toBeLessThanOrEqual(1);
    }
  });

  it('is reproducible from a seed and scales power with rarity', async () => {
    const { rollLoot, DEFAULT_TABLE } = await load('arpg/loot.js');
    const { createRng } = await loadCore('rng.js');
    const roll = (seed: number) => {
      const rng = createRng(seed);
      return Array.from({ length: 20 }, () => rollLoot(DEFAULT_TABLE, () => rng.next()));
    };
    expect(roll(7)).toEqual(roll(7));
    const unique = roll(1).concat(roll(2), roll(3), roll(4), roll(5)).find((i: { rarity: string }) => i.rarity !== 'common');
    expect(unique.power).toBeGreaterThanOrEqual(1);
  });
});

describe('arpg/inventory.js', () => {
  it('equips from the bag, swapping the worn item back, and totals power', async () => {
    const { createInventory, pickUp, equip, equippedPower } = await load('arpg/inventory.js');
    const inv = createInventory(2);
    const a = { id: 'a', name: 'A', slot: 'weapon', rarity: 'common', power: 4 };
    const b = { id: 'b', name: 'B', slot: 'weapon', rarity: 'rare', power: 9 };
    expect(pickUp(inv, a)).toBe(true);
    expect(pickUp(inv, b)).toBe(true);
    expect(pickUp(inv, a)).toBe(false);
    equip(inv, 0);
    equip(inv, 0);
    expect(inv.equipped.weapon.id).toBe('b');
    expect(inv.bag.map((i: { id: string }) => i.id)).toEqual(['a']);
    expect(equippedPower(inv)).toBe(9);
  });
});

describe('arpg/dungeon.js', () => {
  it('12 rooms, joined: every room is reachable from the first, for several seeds', async () => {
    const { generateDungeon, reachable } = await load('arpg/dungeon.js');
    for (const seed of [1, 2, 3, 42, 1000]) {
      const d = generateDungeon(seed, 12);
      expect(d.rooms).toHaveLength(12);
      expect(d.corridors).toHaveLength(11);
      const first = { x: Math.floor(d.rooms[0].x + d.rooms[0].w / 2), y: Math.floor(d.rooms[0].y + d.rooms[0].h / 2) };
      const seen = reachable(d.grid, first);
      for (const r of d.rooms) expect(seen.has(`${r.x},${r.y}`), `seed ${seed}`).toBe(true);
    }
  });

  it('is deterministic per seed', async () => {
    const { generateDungeon } = await load('arpg/dungeon.js');
    expect(generateDungeon(5).grid).toEqual(generateDungeon(5).grid);
    expect(generateDungeon(5).grid).not.toEqual(generateDungeon(6).grid);
  });
});

describe('crime/wanted.js', () => {
  it('crimes raise the level (capped at 5), wanted 3 decays to 2 after 30 s unseen', async () => {
    const { createWanted, wantedReducer } = await load('crime/wanted.js');
    let s = createWanted();
    for (let i = 0; i < 3; i += 1) s = wantedReducer(s, { type: 'crime', crime: 'pedestrian' });
    expect(s.level).toBe(3);
    s = wantedReducer(s, { type: 'tick', dt: 29_999, seen: false });
    expect(s.level).toBe(3);
    s = wantedReducer(s, { type: 'tick', dt: 1, seen: false });
    expect(s.level).toBe(2);
    for (let i = 0; i < 9; i += 1) s = wantedReducer(s, { type: 'crime', crime: 'police' });
    expect(s.level).toBe(5);
  });

  it('being seen resets the unseen timer; the reducer does not mutate', async () => {
    const { wantedReducer } = await load('crime/wanted.js');
    const before = { level: 2, unseenMs: 20_000 };
    const after = wantedReducer(before, { type: 'tick', dt: 5000, seen: true });
    expect(after).toEqual({ level: 2, unseenMs: 0 });
    expect(before).toEqual({ level: 2, unseenMs: 20_000 });
  });
});

describe('crime/car2d.js', () => {
  it('accelerates along the heading to a capped top speed', async () => {
    const { createCar, car2dStep, carSpeed, CAR_DEFAULTS } = await load('crime/car2d.js');
    let car = createCar();
    for (let i = 0; i < 600; i += 1) car = car2dStep(car, { throttle: 1, steer: 0 }, 1 / 60);
    expect(car.x).toBeGreaterThan(100);
    expect(Math.abs(car.y)).toBeLessThan(1e-6);
    expect(carSpeed(car)).toBeLessThanOrEqual(CAR_DEFAULTS.maxSpeed);
  });

  it('a stopped car does not spin, a moving one turns, and grip removes sideways slide', async () => {
    const { createCar, car2dStep } = await load('crime/car2d.js');
    expect(car2dStep(createCar(), { throttle: 0, steer: 1 }, 0.1).heading).toBe(0);
    let car = createCar({ vx: 200 });
    for (let i = 0; i < 30; i += 1) car = car2dStep(car, { throttle: 0.5, steer: 1 }, 1 / 60);
    expect(car.heading).toBeGreaterThan(0.2);
    const sliding = car2dStep(createCar({ vy: 100 }), { throttle: 0, steer: 0 }, 0.2);
    expect(Math.abs(sliding.vy)).toBeLessThan(100);
  });

  it('braking from forward speed stops before reversing', async () => {
    const { createCar, car2dStep } = await load('crime/car2d.js');
    let car = createCar({ vx: 100 });
    car = car2dStep(car, { throttle: -1, steer: 0 }, 0.1);
    expect(car.vx).toBeLessThan(100);
    expect(car.vx).toBeGreaterThan(0);
  });
});

describe('fps/weapon-table.js and sight.js', () => {
  it('fires on cooldown, spends ammo, and refuses when dry', async () => {
    const { createLoadout, fire } = await load('fps/weapon-table.js');
    const l = createLoadout({ ammo: { bullets: 2 } });
    expect(fire(l, 0, () => 0.5)).toMatchObject({ weapon: { id: 'pistol' }, offsetsDeg: [0] });
    expect(fire(l, 100, () => 0.5)).toBeNull();
    expect(fire(l, 350, () => 0.5)).not.toBeNull();
    expect(fire(l, 10_000, () => 0.5)).toBeNull();
    expect(l.ammo.bullets).toBe(0);
  });

  it('shotgun fires six pellets spread within its cone; ammo is capped', async () => {
    const { createLoadout, grantWeapon, switchWeapon, fire, addAmmo } = await load('fps/weapon-table.js');
    const l = createLoadout();
    expect(grantWeapon(l, 'shotgun')).toBe(true);
    expect(grantWeapon(l, 'shotgun')).toBe(false);
    expect(addAmmo(l, 'shells', 100)).toBe(30);
    expect(switchWeapon(l, 1)).toBe('shotgun');
    expect(switchWeapon(l, 1)).toBe('pistol');
    switchWeapon(l, 'shotgun');
    const shot = fire(l, 0, Math.random);
    expect(shot.offsetsDeg).toHaveLength(6);
    for (const o of shot.offsetsDeg) expect(Math.abs(o)).toBeLessThanOrEqual(9);
  });

  it('sight is blocked by walls and limited to the field of view', async () => {
    const { canSee, hasLineOfSight } = await load('fps/sight.js');
    const map = [
      [1, 1, 1, 1, 1, 1],
      [1, 0, 0, 1, 0, 1],
      [1, 1, 1, 1, 1, 1],
    ];
    expect(hasLineOfSight(map, { x: 1.5, y: 1.5 }, { x: 2.5, y: 1.5 })).toBe(true);
    expect(hasLineOfSight(map, { x: 1.5, y: 1.5 }, { x: 4.5, y: 1.5 })).toBe(false);
    const open = [[0, 0, 0, 0, 0, 0, 0, 0]];
    const wide = [...open, ...open, ...open];
    expect(canSee({ x: 0.5, y: 1.5, angle: 0 }, { x: 5.5, y: 1.5 }, wide)).toBe(true);
    expect(canSee({ x: 0.5, y: 1.5, angle: Math.PI }, { x: 5.5, y: 1.5 }, wide)).toBe(false);
    expect(canSee({ x: 0.5, y: 1.5, angle: 0 }, { x: 5.5, y: 1.5 }, wide, { range: 3 })).toBe(false);
  });
});

describe('genres/fps level (Tiled-shaped)', () => {
  const levels = pathToFileURL(resolve(__dirname, '../../../../../templates/media-game/genres/fps/src/genre/levels.js')).href;

  it('is rectangular, spawns on floor and every object is reachable through its doors', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
    const { levelMap, wallGrid, levelObjects, LEVEL_ASCII } = (await import(levels)) as any;
    const map = levelMap();
    const grid: number[][] = wallGrid(map);
    expect(new Set(LEVEL_ASCII.map((r: string) => r.length)).size).toBe(1);
    const objects = levelObjects(map) as { name: string; type: string; x: number; y: number }[];
    const spawn = objects.find((o) => o.type === 'spawn')!;
    expect(grid[Math.floor(spawn.y)]![Math.floor(spawn.x)]).toBe(0);
    // Doors (9) and both locked doors (3, 5) count as passable: the keys sit on the near side.
    const seen = new Set<string>();
    const stack = [[Math.floor(spawn.x), Math.floor(spawn.y)]] as [number, number][];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (seen.has(`${x},${y}`) || ![0, 9, 3, 5].includes(grid[y]?.[x] ?? 1)) continue;
      seen.add(`${x},${y}`);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    for (const o of objects) {
      expect(grid[Math.floor(o.y)]![Math.floor(o.x)], o.name).toBe(0);
      expect(seen.has(`${Math.floor(o.x)},${Math.floor(o.y)}`), `${o.name} reachable`).toBe(true);
    }
    expect(objects.filter((o) => o.type === 'enemy').length).toBeGreaterThanOrEqual(5);
  });

  it('the red key is reachable without opening the red door, the violet key without the violet one', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
    const { levelMap, wallGrid, levelObjects } = (await import(levels)) as any;
    const map = levelMap();
    const grid: number[][] = wallGrid(map);
    const objects = levelObjects(map) as { name: string; type: string; x: number; y: number }[];
    const spawn = objects.find((o) => o.type === 'spawn')!;
    const reach = (passable: number[]): Set<string> => {
      const seen = new Set<string>();
      const stack = [[Math.floor(spawn.x), Math.floor(spawn.y)]] as [number, number][];
      while (stack.length) {
        const [x, y] = stack.pop()!;
        if (seen.has(`${x},${y}`) || !passable.includes(grid[y]?.[x] ?? 1)) continue;
        seen.add(`${x},${y}`);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return seen;
    };
    const at = (name: string) => objects.find((o) => o.name === name)!;
    const cell = (o: { x: number; y: number }) => `${Math.floor(o.x)},${Math.floor(o.y)}`;
    expect(reach([0, 9]).has(cell(at('red-key')))).toBe(true);
    expect(reach([0, 9]).has(cell(at('violet-key')))).toBe(false);
    expect(reach([0, 9, 3]).has(cell(at('violet-key')))).toBe(true);
  });
});
