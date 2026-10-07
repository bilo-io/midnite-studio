import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  BackgroundJsonSchema,
  PhaserAtlasJsonSchema,
  rgbaFromRaster,
  seamScore,
  SEAM_PASS,
  TERRAIN_CLASS_INDICES,
  TiledMapSchema,
  TiledTilesetSchema,
  type GitOpResult,
  type SpriteAssetSpec,
} from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageBytesRequest } from '../image/image-service';
import type { GeneratedImage } from '../image/types';
import { decodePng, encodePngGrey8 as encodeGrey8Test, encodePngRgba8 } from '../png/png-codec';
import { backgroundPreflight, createBackgroundRunner, createPropsRunner, propsPreflight } from './environment';
import { createSpriteService, type SpriteJobRunner } from './sprite-service';
import { exportSprite } from './sprite-export';
import { createTilesetRunner, tilesetPreflight, type EnvironmentDeps, type TerrainSource } from './tileset';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sprite-env-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

/** A wrapping value-noise picture: it tiles, so it passes the seam check as drawn. */
function tilingPng(size: number, seed: number, rgb: [number, number, number]): Buffer {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const cells = 8;
  const lattice = Array.from({ length: cells * cells }, rnd);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const at = (i: number, j: number) => lattice[(j % cells) * cells + (i % cells)]!;
      const v = at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
      data.set([rgb[0] * (0.6 + v * 0.4), rgb[1] * (0.6 + v * 0.4), rgb[2] * (0.6 + v * 0.4), 255], (y * size + x) * 4);
    }
  return encodePngRgba8(data, size, size);
}

/** A left-to-right gradient: it cannot tile. */
function gradientPng(w: number, h: number): Buffer {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) data.set([(x / (w - 1)) * 255, 80, 80, 255], (y * w + x) * 4);
  return encodePngRgba8(data, w, h);
}

/** A magenta field with a green block in the middle. */
function blockOnMagenta(w: number, h: number): Buffer {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) data.set([255, 0, 255, 255], i * 4);
  for (let y = h / 4; y < (h * 3) / 4; y += 1) for (let x = w / 4; x < (w * 3) / 4; x += 1) data.set([30, 160, 60, 255], (y * w + x) * 4);
  return encodePngRgba8(data, w, h);
}

const image = (bytes: Buffer): GitOpResult<GeneratedImage> => ({ ok: true, value: { bytes, mime: 'image/png' } });

const noTerrain: EnvironmentDeps['readTerrain'] = async () => ({ ok: false, kind: 'error', message: 'Terrain not found.' });

function make(runJob: SpriteJobRunner, preflight?: Parameters<typeof createSpriteService>[0]['preflight']) {
  return createSpriteService({
    rootFor: async () => root,
    writeBytes: async ({ project, path, data }) => {
      const abs = join(root, project, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, data);
      return { ok: true, value: undefined };
    },
    trash: (abs) => rm(abs, { recursive: true, force: true }),
    toPng: async () => null,
    onChanged: () => undefined,
    emitProgress: () => undefined,
    emitChanged: () => undefined,
    log: () => undefined,
    runJob,
    ...(preflight ? { preflight } : {}),
  });
}

async function create(service: ReturnType<typeof make>, spec: Record<string, unknown>) {
  const created = await service.library({ op: 'create', repoId: 'r', spec });
  if (!created.ok || !created.value.asset || !created.value.group) throw new Error('create failed');
  return { repoId: 'r', group: created.value.group, asset: created.value.asset };
}

const run = async (service: ReturnType<typeof make>, target: { repoId: string; group: 'tilesets' | 'backgrounds' | 'objects' | 'characters' | 'maps'; asset: string }) => {
  const job = await service.generate(target);
  if (!job.ok) throw new Error(job.kind === 'error' ? job.message : 'no job');
  await vi.waitFor(() => expect(service.jobStatus(job.value.jobId)?.state).not.toBe('running'), { timeout: 20_000 });
  return service.jobStatus(job.value.jobId)!;
};

const pngOf = async (path: string) => {
  const decoded = decodePng(await readFile(path));
  if (!decoded.ok) throw new Error(decoded.message);
  return rgbaFromRaster(decoded.image);
};

const TILESET = { kind: 'tileset', name: 'Meadow', style: 'flat', tileSize: 16, terrains: [{ id: 'grass', label: 'Grass', prompt: 'grass' }, { id: 'rock', label: 'Rock', prompt: 'rock', collision: 'solid' }], transitions: [{ a: 'grass', b: 'rock' }] };

describe('tileset runner', () => {
  it('draws one base per terrain, composites the transitions and writes the sheet and the .tsj', async () => {
    const requests: ImageBytesRequest[] = [];
    let n = 0;
    const generateImage = async (req: ImageBytesRequest) => {
      requests.push(req);
      n += 1;
      return image(tilingPng(128, n, n % 2 ? [60, 160, 60] : [140, 140, 150]));
    };
    const service = make(createTilesetRunner({ generateImage, toPng: async () => null, readTerrain: noTerrain }), tilesetPreflight);
    const target = await create(service, TILESET);
    expect(target.group).toBe('tilesets');
    const status = await run(service, target);
    expect(status.state).toBe('done');
    expect(requests).toHaveLength(2);
    expect(requests[0]!.prompt).toMatch(/seamless, tileable, top-down/);
    expect(requests[0]!.aspect).toBe('1:1');
    const dir = join(root, 'tilesets', target.asset);
    const sheet = await pngOf(join(dir, 'tileset.png'));
    expect([sheet.width, sheet.height]).toEqual([8 * 16, 7 * 16]);
    const tsj = TiledTilesetSchema.parse(JSON.parse(await readFile(join(dir, 'tileset.tsj'), 'utf8')));
    expect(tsj.tilecount).toBe(49);
    expect(tsj.tiles![1]!.properties[0]!.value).toBe('solid');
    expect(tsj.wangsets![0]!.wangtiles).toHaveLength(47);
    for (const id of ['grass', 'rock']) await stat(join(dir, 'terrains', `${id}.png`));
    const got = await service.get(target);
    if (!got.ok) throw new Error('get');
    expect(got.value.spec.lastReport).toMatchObject({ frames: 49, failing: 0 });
  });

  it('repairs a base tile that does not tile, and records the seam check', async () => {
    const generateImage = vi.fn(async () => image(gradientPng(128, 128)));
    const service = make(createTilesetRunner({ generateImage, toPng: async () => null, readTerrain: noTerrain }), tilesetPreflight);
    const target = await create(service, TILESET);
    const status = await run(service, target);
    expect(status.state).toBe('done');
    // repair makes the gradient pass, so no warning and no second draw
    expect(generateImage).toHaveBeenCalledTimes(2);
    const base = await pngOf(join(root, 'tilesets', target.asset, 'terrains', 'grass.png'));
    expect(seamScore(base, 'xy')).toBeLessThanOrEqual(SEAM_PASS);
    const seams = JSON.parse(await readFile(join(root, 'tilesets', target.asset, 'terrains', 'seams.json'), 'utf8'));
    expect(seams.grass).toMatchObject({ repaired: true, passes: true });
  });

  it('fits one palette over every base in pixel style', async () => {
    let n = 0;
    const generateImage = async () => image(tilingPng(64, (n += 1), [200, 90 + n * 40, 50]));
    const service = make(createTilesetRunner({ generateImage, toPng: async () => null, readTerrain: noTerrain }), tilesetPreflight);
    const target = await create(service, { ...TILESET, style: 'pixel', palette: { size: 6 } });
    expect((await run(service, target)).state).toBe('done');
    const got = await service.get(target);
    if (!got.ok || got.value.spec.kind !== 'tileset') throw new Error('get');
    expect(got.value.spec.palette && 'colours' in got.value.spec.palette ? got.value.spec.palette.colours.length : 0).toBeLessThanOrEqual(6);
    const sheet = await pngOf(join(root, 'tilesets', target.asset, 'tileset.png'));
    const colours = new Set<number>();
    for (let i = 0; i < sheet.data.length; i += 4) colours.add((sheet.data[i]! << 16) | (sheet.data[i + 1]! << 8) | sheet.data[i + 2]!);
    expect(colours.size).toBeLessThanOrEqual(6);
  });

  it('refuses a transition to a terrain it lacks, before any request', async () => {
    const generateImage = vi.fn();
    const service = make(createTilesetRunner({ generateImage, toPng: async () => null, readTerrain: noTerrain }), tilesetPreflight);
    const target = await create(service, { ...TILESET, transitions: [{ a: 'grass', b: 'lava' }] });
    const job = await service.generate(target);
    expect(job).toMatchObject({ ok: false });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('makes an isometric tileset with floors and blocks', async () => {
    const generateImage = async () => image(tilingPng(64, 5, [90, 140, 90]));
    const service = make(createTilesetRunner({ generateImage, toPng: async () => null, readTerrain: noTerrain }), tilesetPreflight);
    const target = await create(service, { ...TILESET, projection: 'isometric' });
    expect((await run(service, target)).state).toBe('done');
    const tsj = TiledTilesetSchema.parse(JSON.parse(await readFile(join(root, 'tilesets', target.asset, 'tileset.tsj'), 'utf8')));
    expect(tsj).toMatchObject({ tilewidth: 32, tileheight: 24, tilecount: 51 });
    const kinds = tsj.tiles!.map((t) => t.properties.find((p) => p.name === 'kind')?.value);
    expect(kinds.filter((k) => k === 'block')).toHaveLength(2);
  });
});

describe('tileset from a terrain', () => {
  const drape = (() => {
    const data = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) data.set([x < 32 ? 40 : 200, 120, 60, 255], (y * 64 + x) * 4);
    return encodePngRgba8(data, 64, 64);
  })();
  const landcover = (() => {
    const classes = new Uint8Array(16 * 16).fill(TERRAIN_CLASS_INDICES.grass);
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 4; x += 1) classes[y * 16 + x] = TERRAIN_CLASS_INDICES.water;
    return encodeGrey8Test(classes, 16, 16);
  })();
  const readTerrain = (worldSize: number): EnvironmentDeps['readTerrain'] => async () => ({ ok: true, value: { worldSize, drape, landcover } satisfies TerrainSource });
  const FROM = { kind: 'tileset', name: 'Isle', style: 'flat', tileSize: 16, fromTerrain: { project: 'p', terrain: 'isle', metresPerTile: 4 } };

  it('cuts the terrain into a grid of tiles and a map of them', async () => {
    const service = make(createTilesetRunner({ generateImage: vi.fn(), toPng: async () => null, readTerrain: readTerrain(32) }), tilesetPreflight);
    const target = await create(service, FROM);
    expect((await run(service, target)).state).toBe('done');
    const dir = join(root, 'tilesets', target.asset);
    const tmj = TiledMapSchema.parse(JSON.parse(await readFile(join(dir, 'map.tmj'), 'utf8')));
    expect(tmj).toMatchObject({ width: 8, height: 8, orientation: 'orthogonal' });
    const tsj = TiledTilesetSchema.parse(JSON.parse(await readFile(join(dir, 'tileset.tsj'), 'utf8')));
    expect(tsj.tilecount).toBeLessThan(64);
    expect(tsj.tiles!.some((t) => t.properties[0]!.value === 'water')).toBe(true);
  });

  it('refuses a grid over 256 × 256 and says how to fix it', async () => {
    const service = make(createTilesetRunner({ generateImage: vi.fn(), toPng: async () => null, readTerrain: readTerrain(2048) }), tilesetPreflight);
    const target = await create(service, FROM);
    const status = await run(service, target);
    expect(status.state).toBe('failed');
    expect(status.message).toMatch(/512 × 512.*Raise metres per tile/);
  });

  it('says the isometric map is flat', async () => {
    const service = make(createTilesetRunner({ generateImage: vi.fn(), toPng: async () => null, readTerrain: readTerrain(32) }), tilesetPreflight);
    const target = await create(service, { ...FROM, projection: 'isometric' });
    const status = await run(service, target);
    expect(status).toMatchObject({ state: 'done', message: 'Isometric maps from terrain are flat; height is not drawn.' });
    const tmj = TiledMapSchema.parse(JSON.parse(await readFile(join(root, 'tilesets', target.asset, 'map.tmj'), 'utf8')));
    expect(tmj.orientation).toBe('isometric');
  });
});

describe('background runner', () => {
  const BG = { kind: 'background', name: 'Dusk', style: 'flat', size: [256, 128] };

  it('draws every layer, keys all but the sky, wraps them on x and lists the scroll factors', async () => {
    const requests: ImageBytesRequest[] = [];
    const generateImage = async (req: ImageBytesRequest) => {
      requests.push(req);
      return image(req.prompt.includes('sky') ? tilingPng(128, 3, [120, 170, 230]) : blockOnMagenta(128, 64));
    };
    const service = make(createBackgroundRunner({ generateImage, toPng: async () => null, readTerrain: noTerrain }), backgroundPreflight);
    const target = await create(service, BG);
    expect(target.group).toBe('backgrounds');
    const status = await run(service, target);
    expect(status.state).toBe('done');
    expect(requests).toHaveLength(4);
    expect(requests[0]!.aspect).toBe('16:9');
    const dir = join(root, 'backgrounds', target.asset);
    const json = BackgroundJsonSchema.parse(JSON.parse(await readFile(join(dir, 'background.json'), 'utf8')));
    expect(json.layers.map((l) => l.scrollFactor)).toEqual([0, 0.2, 0.5, 0.8]);
    const sky = await pngOf(join(dir, 'layers', 'sky.png'));
    const near = await pngOf(join(dir, 'layers', 'near.png'));
    expect([sky.width, sky.height]).toEqual([256, 128]);
    expect(sky.data[3]).toBe(255);
    expect(near.data[3]).toBe(0);
    for (const name of ['sky', 'far', 'mid', 'near']) expect(seamScore(await pngOf(join(dir, 'layers', `${name}.png`)), 'x')).toBeLessThanOrEqual(SEAM_PASS);
  });
});

describe('prop runner', () => {
  const PROPS = { kind: 'prop-sheet', name: 'Camp', style: 'flat', cell: [32, 32], props: [{ name: 'crate', prompt: 'wooden crate' }, { name: 'barrel', prompt: 'barrel' }] };

  it('draws one prop per request, keys it and fits it to the cell, bottom-centred', async () => {
    const generateImage = vi.fn(async () => image(blockOnMagenta(64, 64)));
    const service = make(createPropsRunner({ generateImage, toPng: async () => null, readTerrain: noTerrain }), propsPreflight);
    const target = await create(service, PROPS);
    expect(target.group).toBe('objects');
    expect((await run(service, target)).state).toBe('done');
    expect(generateImage).toHaveBeenCalledTimes(2);
    const crate = await pngOf(join(root, 'objects', target.asset, 'props', 'crate', '000.png'));
    expect([crate.width, crate.height]).toEqual([32, 32]);
    const alphaAt = (x: number, y: number) => crate.data[(y * 32 + x) * 4 + 3]!;
    expect(alphaAt(16, 31 - 1)).toBe(255);
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(16, 0)).toBe(0);
  });

  it('refuses an empty list', async () => {
    const service = make(createPropsRunner({ generateImage: vi.fn(), toPng: async () => null, readTerrain: noTerrain }), propsPreflight);
    const target = await create(service, { ...PROPS, props: [] });
    expect(await service.generate(target)).toMatchObject({ ok: false });
  });
});

describe('environment export', () => {
  async function built(spec: Record<string, unknown>, runner: SpriteJobRunner, preflight: Parameters<typeof make>[1]) {
    const service = make(runner, preflight);
    const target = await create(service, spec);
    expect((await run(service, target)).state).toBe('done');
    const got = await service.get(target);
    if (!got.ok) throw new Error('get');
    return { dir: join(root, target.group, target.asset), spec: got.value.spec as SpriteAssetSpec, frames: got.value.frames };
  }
  const pack = { maxSize: 2048 as const, padding: 2, extrude: 1 as const, pot: true };

  it('exports a tileset as <name>.tileset/ with the sheet, the .tsj and sprite.json', async () => {
    const { dir, spec, frames } = await built(TILESET, createTilesetRunner({ generateImage: async () => image(tilingPng(64, 9, [90, 140, 90])), toPng: async () => null, readTerrain: noTerrain }), tilesetPreflight);
    const dest = join(root, 'out');
    const result = await exportSprite({ dir, spec, frames, pack, dest });
    if (!result.ok) throw new Error(result.kind === 'error' ? result.message : 'fail');
    expect(result.value.path).toBe(join(dest, 'meadow.tileset'));
    expect((await readdir(result.value.path)).sort()).toEqual(['sprite.json', 'tileset.png', 'tileset.tsj']);
    TiledTilesetSchema.parse(JSON.parse(await readFile(join(result.value.path, 'tileset.tsj'), 'utf8')));
    expect((await readdir(join(dir, 'export'))).sort()).toEqual(['tileset.png', 'tileset.tsj']);
    expect(await exportSprite({ dir, spec, frames, pack, dest })).toMatchObject({ ok: false, message: 'meadow.tileset already exists in that folder.' });
  });

  it('exports a terrain-sourced tileset with its map', async () => {
    const drape = encodePngRgba8(new Uint8Array(32 * 32 * 4).fill(150), 32, 32);
    const { dir, spec, frames } = await built(
      { kind: 'tileset', name: 'Isle', style: 'flat', tileSize: 16, fromTerrain: { project: 'p', terrain: 'isle', metresPerTile: 4 } },
      createTilesetRunner({ generateImage: vi.fn(), toPng: async () => null, readTerrain: async () => ({ ok: true, value: { worldSize: 16, drape, landcover: null } }) }),
      tilesetPreflight,
    );
    const result = await exportSprite({ dir, spec, frames, pack, dest: join(root, 'out') });
    if (!result.ok) throw new Error('fail');
    expect((await readdir(result.value.path)).sort()).toEqual(['map.tmj', 'sprite.json', 'tileset.png', 'tileset.tsj']);
  });

  it('exports a background as <name>.background/ with its layers and background.json', async () => {
    const { dir, spec, frames } = await built(
      { kind: 'background', name: 'Dusk', style: 'flat', size: [128, 64] },
      createBackgroundRunner({ generateImage: async (req) => image(req.prompt.includes('sky') ? tilingPng(64, 3, [120, 170, 230]) : blockOnMagenta(64, 32)), toPng: async () => null, readTerrain: noTerrain }),
      backgroundPreflight,
    );
    const result = await exportSprite({ dir, spec, frames, pack, dest: join(root, 'out') });
    if (!result.ok) throw new Error('fail');
    expect(result.value.path).toBe(join(root, 'out', 'dusk.background'));
    expect((await readdir(result.value.path)).sort()).toEqual(['background.json', 'layers', 'sprite.json']);
    expect((await readdir(join(result.value.path, 'layers'))).sort()).toEqual(['far.png', 'mid.png', 'near.png', 'sky.png']);
    BackgroundJsonSchema.parse(JSON.parse(await readFile(join(result.value.path, 'background.json'), 'utf8')));
  });

  it('exports a prop sheet as an atlas with no animations', async () => {
    const { dir, spec, frames } = await built(
      { kind: 'prop-sheet', name: 'Camp', style: 'flat', cell: [32, 32], props: ['crate', 'barrel'] },
      createPropsRunner({ generateImage: async () => image(blockOnMagenta(64, 64)), toPng: async () => null, readTerrain: noTerrain }),
      propsPreflight,
    );
    const result = await exportSprite({ dir, spec, frames, pack, dest: join(root, 'out') });
    if (!result.ok) throw new Error('fail');
    expect(result.value.frames).toBe(2);
    expect((await readdir(result.value.path)).sort()).toEqual(['atlas.json', 'atlas.png', 'sprite.json']);
    const raw = JSON.parse(await readFile(join(result.value.path, 'atlas.json'), 'utf8')) as { meta: { frameTags?: unknown[] } };
    const atlas = PhaserAtlasJsonSchema.parse(raw);
    expect(Object.keys(atlas.frames).sort()).toEqual(['barrel', 'crate']);
    expect(raw.meta.frameTags).toEqual([]);
  });

  it('says what is missing before anything is generated', async () => {
    const service = make(async () => undefined);
    const target = await create(service, TILESET);
    const got = await service.get(target);
    if (!got.ok) throw new Error('get');
    const result = await exportSprite({ dir: join(root, 'tilesets', target.asset), spec: got.value.spec, frames: got.value.frames, pack });
    expect(result).toMatchObject({ ok: false, message: 'There is no tileset to export yet. Generate it first.' });
  });
});

describe('preflights', () => {
  it('only judge their own kind', () => {
    const tileset = { kind: 'tileset' } as SpriteAssetSpec;
    expect(backgroundPreflight(tileset, {})).toBeNull();
    expect(propsPreflight(tileset, {})).toBeNull();
  });
});
