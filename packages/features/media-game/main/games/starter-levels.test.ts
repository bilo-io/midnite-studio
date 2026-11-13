// @vitest-environment node
// Phase 132 Theme F: every starter reads its layout from `levels/level.tmj`. Plain node: it composes real starters into
// temp folders and reads files, so it needs no browser capability.
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { allStarterIds, dimensionOf, parseGameLevel, parseGameManifest, parseStarterId, GAME_MANIFEST_FILE } from '@midnite/studio-shared';

import { composeStarter } from './compose';
import { createGame } from './game-scaffold';
import { PALETTE_FILE, PALETTE_KINDS, PALETTE_TILE } from './level-palette';
import { listFilesRecursive } from './starter-files.test-helper';

const TEMPLATE_DIR = join(__dirname, '../../../../../templates/media-game');
const ENGINES_DIR = join(TEMPLATE_DIR, '..', '..', 'packages', 'desktop', 'resources', 'game-engines');

const made: string[] = [];
afterAll(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true });
});
const tmp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'midnite-starter-levels-'));
  made.push(dir);
  return dir;
};

type Obj = { name: string; type: string; x: number; y: number; width: number; height: number };
type Layer = { name: string; type: string; data?: number[]; width?: number; objects?: Obj[] };
type TiledMap = {
  width: number;
  height: number;
  layers: Layer[];
  properties?: { name: string; value: unknown }[];
  tilesets: { image: string; imagewidth: number; imageheight: number; tilecount: number; tiles: { id: number; properties: { name: string; value: string }[] }[] }[];
};

const readMap = async (path: string): Promise<TiledMap> => JSON.parse(await readFile(path, 'utf8')) as TiledMap;
const objects = (map: TiledMap): Obj[] => map.layers.find((l) => l.type === 'objectgroup')?.objects ?? [];
const grid = (map: TiledMap, layer: string): number[][] => {
  const l = map.layers.find((x) => x.name === layer)!;
  const rows: number[][] = [];
  for (let i = 0; i < l.data!.length; i += l.width!) rows.push(l.data!.slice(i, i + l.width!));
  return rows;
};

describe('every starter reads its levels from files', () => {
  it.each(allStarterIds())('%s composes a valid level, a scene that builds from it and a levels manifest', async (id) => {
    const parsed = parseStarterId(id)!;
    const dim = dimensionOf(parsed.perspective);
    const dest = await tmp();
    const composed = await composeStarter(id, dest, { templateDir: TEMPLATE_DIR, name: 'Probe' });
    expect(composed.ok, JSON.stringify(composed)).toBe(true);

    const raw = JSON.parse(await readFile(join(dest, 'levels', 'level.tmj'), 'utf8')) as TiledMap;
    const level = parseGameLevel(raw);
    expect(level.ok, JSON.stringify(level)).toBe(true);
    if (level.ok) expect(level.dimension).toBe(dim);

    const scene = await readFile(join(dest, 'src', 'scenes', 'level.js'), 'utf8');
    expect(scene).toContain(dim === '2d' ? 'kit/phaser/level.js' : 'kit/three/level.js');

    if (dim === '2d') {
      // The palette image is drawn at scaffold time and matches the tileset the level embeds.
      const tileset = raw.tilesets[0]!;
      expect(tileset.image).toBe(PALETTE_FILE);
      const png = await readFile(join(dest, 'levels', PALETTE_FILE));
      expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(png.readUInt32BE(16)).toBe(tileset.imagewidth);
      expect(png.readUInt32BE(20)).toBe(tileset.imageheight);
      expect(tileset.imagewidth).toBe(PALETTE_KINDS.length * PALETTE_TILE);
    } else {
      await expect(stat(join(dest, 'levels', PALETTE_FILE))).rejects.toThrow();
    }
  });

  it('a scaffolded game opts in through its manifest and gets the palette image', async () => {
    const parent = await tmp();
    const result = await createGame(
      { name: 'Hopper', engine: 'phaser', perspective: 'platformer', starter: 'platformer' },
      { templateDir: TEMPLATE_DIR, enginesDir: ENGINES_DIR, gamesRoot: parent, registerRepo: async () => ({ ok: true as const }), defaultNetwork: 'off' },
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const path = join(parent, 'hopper');
    const manifest = parseGameManifest(JSON.parse(await readFile(join(path, GAME_MANIFEST_FILE), 'utf8')));
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;
    expect(manifest.manifest.levels).toEqual({ dir: 'levels', start: 'level' });
    await expect(stat(join(path, 'levels', `${manifest.manifest.levels!.start}.tmj`))).resolves.toBeTruthy();
    expect((await stat(join(path, 'levels', PALETTE_FILE))).size).toBeGreaterThan(100);
  });

  it('a blank game does not opt in', async () => {
    const parent = await tmp();
    const result = await createGame(
      { name: 'Empty', engine: 'phaser', perspective: 'platformer', starter: 'blank' },
      { templateDir: TEMPLATE_DIR, enginesDir: ENGINES_DIR, gamesRoot: parent, registerRepo: async () => ({ ok: true as const }), defaultNetwork: 'off' },
    );
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const manifest = parseGameManifest(JSON.parse(await readFile(join(parent, 'empty', GAME_MANIFEST_FILE), 'utf8')));
    expect(manifest.ok && manifest.manifest.levels).toBeFalsy();
  });
});

describe('the template tree never holds the palette image (Decision 18)', () => {
  it('has no png under any levels/ folder', async () => {
    const files = await listFilesRecursive(TEMPLATE_DIR);
    const inLevels = files.filter((f) => /(^|\/)levels\//.test(f));
    expect(inLevels.filter((f) => /\.png$/i.test(f))).toEqual([]);
    expect(inLevels.length).toBeGreaterThan(0);
    expect(inLevels.every((f) => f.endsWith('.tmj'))).toBe(true);
  });

  it('describes the same nine tiles in the level and in code', async () => {
    const map = await readMap(join(TEMPLATE_DIR, 'bases', 'platformer', 'levels', 'level.tmj'));
    const tileset = map.tilesets[0]!;
    expect(tileset.tilecount).toBe(PALETTE_KINDS.length);
    expect(tileset.tiles.map((t) => t.properties.find((p) => p.name === 'kind')?.value)).toEqual(PALETTE_KINDS.map((k) => k.kind));
  });
});

describe('layout regression: the files hold the coordinates the scenes used to hard-code', () => {
  it('platformer', async () => {
    const map = await readMap(join(TEMPLATE_DIR, 'bases', 'platformer', 'levels', 'level.tmj'));
    const ground = grid(map, 'ground');
    expect(ground).toHaveLength(17);
    expect(ground[16]!.every((g) => g === 1)).toBe(true);
    expect(ground.slice(0, 16).flat().every((g) => g === 0)).toBe(true);
    const objs = objects(map);
    expect(objs.find((o) => o.type === 'spawn')).toMatchObject({ x: 64, y: 400 });
    expect(objs.filter((o) => o.name === 'coin').map((o) => [o.x, o.y])).toEqual([[332, 372], [552, 302], [792, 232]]);
    expect(objs.find((o) => o.name === 'walker')).toMatchObject({ x: 900, y: 492 });
    // A one-way ledge is four 32 px tiles centred on the old (x, y).
    expect(objs.filter((o) => o.type === 'oneway').map((o) => [o.x + 16, o.y + o.height / 2, o.width / 32])).toEqual([[300, 400, 4], [520, 330, 4], [760, 260, 4]]);
  });

  it('top-down', async () => {
    const objs = objects(await readMap(join(TEMPLATE_DIR, 'bases', 'top-down', 'levels', 'level.tmj')));
    expect(objs.filter((o) => o.name === 'wall').map((o) => [o.x + o.width / 2, o.y + o.height / 2])).toEqual([[400, 300], [464, 300], [528, 300], [800, 600], [800, 664], [1100, 400]]);
    expect(objs.find((o) => o.type === 'spawn')).toMatchObject({ x: 96, y: 96 });
  });

  it('isometric', async () => {
    const map = await readMap(join(TEMPLATE_DIR, 'bases', 'isometric', 'levels', 'level.tmj'));
    const walls = grid(map, 'collision').map((row) => row.map((g) => (g ? 1 : 0)));
    expect(walls).toEqual([
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    expect(objects(map).filter((o) => o.name === 'gem').map((o) => [o.x / 32 - 0.5, o.y / 32 - 0.5])).toEqual([[5, 1], [8, 5], [2, 6]]);
  });

  it('raycaster', async () => {
    const map = await readMap(join(TEMPLATE_DIR, 'bases', 'raycaster', 'levels', 'level.tmj'));
    expect(grid(map, 'walls')[1]).toEqual([1, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 1]);
    expect(grid(map, 'walls')[3]![9]).toBe(2);
    expect(objects(map).find((o) => o.name === 'grunt')).toMatchObject({ x: 9.5 * 64, y: 3.5 * 64 });
  });

  it('fps: the walls are the old LEVEL_ASCII', async () => {
    const ascii = [
      '########################',
      '#P..a.#........#,,,v,,,#',
      '#.....#...g....#,,,h,,,#',
      '#.....D........R,,,,,,,#',
      '#..g..#........#,,,g,,,#',
      '###D###...r....#########',
      '#.....#........#.......#',
      '#..h..#........#...g...#',
      '#.....#........V.......#',
      '#..g..D...s....#.......#',
      '#..k..#........#...a...#',
      '########################',
    ];
    const ids: Record<string, number> = { '#': 1, D: 9, R: 3, V: 5 };
    const map = await readMap(join(TEMPLATE_DIR, 'genres', 'fps', 'levels', 'level.tmj'));
    expect(grid(map, 'walls')).toEqual(ascii.map((row) => [...row].map((ch) => ids[ch] ?? 0)));
    expect(grid(map, 'sky').map((row) => row.map((g) => (g ? ',' : '.')).join(''))).toEqual(ascii.map((row) => [...row].map((ch) => (ch === ',' ? ',' : '.')).join('')));
    const spawn = objects(map).find((o) => o.type === 'spawn')!;
    expect([spawn.x / 64 - 0.5, spawn.y / 64 - 0.5]).toEqual([1, 1]);
    expect(objects(map).filter((o) => o.type === 'enemy')).toHaveLength(ascii.join('').split('g').length - 1);
  });

  it('crime: buildings are the rule the genre still draws roads from', async () => {
    const map = await readMap(join(TEMPLATE_DIR, 'genres', 'crime', 'levels', 'level.tmj'));
    const BLOCK = 14;
    const ROAD = 3;
    const solid = (x: number, y: number): number => {
      if (x % BLOCK < ROAD || y % BLOCK < ROAD) return 0;
      const bx = (x % BLOCK) - ROAD;
      const by = (y % BLOCK) - ROAD;
      return bx >= 1 && bx <= 9 && by >= 1 && by <= 9 ? 1 : 0;
    };
    expect([map.width, map.height]).toEqual([59, 45]);
    expect(grid(map, 'buildings').map((row) => row.map((g) => (g ? 1 : 0)))).toEqual(Array.from({ length: 45 }, (_, y) => Array.from({ length: 59 }, (_, x) => solid(x, y))));
    expect(objects(map).find((o) => o.type === 'spawn')).toMatchObject({ x: 48, y: 48 });
  });

  it('3D: the shared arena sits where the scenes had it', async () => {
    const map = await readMap(join(TEMPLATE_DIR, 'bases', 'first-person', 'levels', 'level.tmj'));
    const centre = (o: Obj): [number, number] => [(o.x + o.width / 2) / 32, (o.y + o.height / 2) / 32];
    const objs = objects(map);
    expect(objs.filter((o) => o.name === 'crate').map(centre)).toEqual([[-5, -6], [0, -10], [5, -6]]);
    expect(centre(objs.find((o) => o.name === 'door')!)).toEqual([0, -3]);
    const enemy = objs.find((o) => o.name === 'enemy')!;
    expect([enemy.x / 32, enemy.y / 32]).toEqual([-3, 4]);
    const spawn = objs.find((o) => o.type === 'spawn')!;
    expect([spawn.x / 32, spawn.y / 32]).toEqual([0, 6]);
  });

  it('open-world names its terrain asset', async () => {
    const map = await readMap(join(TEMPLATE_DIR, 'genres', 'open-world', 'levels', 'level.tmj'));
    expect(map.properties?.find((p) => p.name === 'midnite.terrain')?.value).toBe('world');
  });
});
