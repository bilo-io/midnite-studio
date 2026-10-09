import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  assembleTileset,
  createRgba,
  MAP_NEEDS_ENGINE,
  MAP_NEEDS_TILESET,
  parseSpriteSpec,
  TiledMapSchema,
  TilesetSpecSchema,
  type GitOpResult,
  type SpriteAssetSpec,
} from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LlmCall } from '../model/model-service';
import { encodePngRgba8 } from '../png/png-codec';
import { createMapRunner, mapPreflight, writeMapLayout } from './map-generate';
import { readTmjForImport } from './map-import';
import { exportSprite } from './sprite-export';
import { createSpriteService } from './sprite-service';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sprite-map-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const TERRAINS = [
  { id: 'grass', label: 'Grass', collision: 'walkable' as const },
  { id: 'dirt', label: 'Dirt', collision: 'walkable' as const },
  { id: 'water', label: 'Water', collision: 'water' as const },
];
const layout = (regionTerrain: string) =>
  JSON.stringify({
    width: 12,
    height: 10,
    base: 'grass',
    regions: [
      { terrain: 'dirt', shape: 'rect', points: [[1, 1], [3, 3]] },
      { terrain: 'dirt', shape: 'rect', points: [[8, 1], [9, 2]] },
      { terrain: regionTerrain, shape: 'ellipse', points: [[6, 6], [2, 2]] },
    ],
    objects: [
      { type: 'spawn', name: 'player', x: 1, y: 8 },
      { type: 'exit', name: 'door', x: 11, y: 0 },
    ],
  });
const reply = (text: string): GitOpResult<{ text: string }> => ({ ok: true, value: { text } });

function service(llm: LlmCall) {
  const runner = createMapRunner({ llmCall: llm });
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
    runJob: runner,
    preflight: mapPreflight,
  });
}

/** A built tileset asset: spec, `tileset.png` and `tileset.tsj`, as Theme H's job writes them. */
async function seedTileset(asset = 'meadow-20261004-120000') {
  const spec = TilesetSpecSchema.parse({ kind: 'tileset', name: 'meadow', tileSize: 16, terrains: TERRAINS, transitions: [{ a: 'grass', b: 'water' }] });
  const solid = (r: number) => {
    const img = createRgba(16, 16);
    for (let i = 0; i < 256; i += 1) img.data.set([r, 120, 60, 255], i * 4);
    return img;
  };
  const built = assembleTileset(spec, TERRAINS.map((t, i) => ({ id: t.id, collision: t.collision, image: solid(40 + i * 80) })));
  const dir = join(root, 'tilesets', asset);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'sprite.json'), JSON.stringify(spec));
  await writeFile(join(dir, 'tileset.tsj'), JSON.stringify(built.tsj));
  await writeFile(join(dir, 'tileset.png'), encodePngRgba8(new Uint8Array(built.sheet.data.buffer), built.sheet.width, built.sheet.height));
  return asset;
}

async function waitDone(svc: ReturnType<typeof service>, jobId: string) {
  await vi.waitFor(() => expect(svc.jobStatus(jobId)?.state).not.toBe('running'), { timeout: 5000 });
  return svc.jobStatus(jobId)!;
}

describe('writeMapLayout', () => {
  it('sends a layout naming an unknown terrain back for one repair round, with the issue named', async () => {
    const prompts: string[] = [];
    const llm: LlmCall = vi.fn(async ({ prompt }) => {
      prompts.push(prompt);
      return reply(prompts.length === 1 ? layout('lava') : layout('water'));
    });
    const out = await writeMapLayout({ llmCall: llm }, { engine: { kind: 'ollama', model: 'm' }, repoId: 'r', prompt: 'an island', terrains: TERRAINS, size: [12, 10], orientation: 'orthogonal', signal: new AbortController().signal });
    expect(out.ok && out.value.repairs).toBe(1);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('regions[2].terrain: "lava" is not in this tileset (grass, dirt, water)');
    expect(prompts[0]).toContain('- water (Water, water)');
  });

  it('gives up after two repairs and lists what is still wrong', async () => {
    const llm: LlmCall = vi.fn(async () => reply(layout('lava')));
    const out = await writeMapLayout({ llmCall: llm }, { engine: { kind: 'ollama', model: 'm' }, repoId: 'r', prompt: '', terrains: TERRAINS, size: [12, 10], orientation: 'orthogonal', signal: new AbortController().signal });
    expect(llm).toHaveBeenCalledTimes(3);
    expect(out.ok).toBe(false);
    if (!out.ok && out.kind === 'error') expect(out.message).toContain('after 2 repairs');
  });
});

describe('map job', () => {
  it('lays out, fills and writes a .tmj with its tilesets embedded, then exports a pack', async () => {
    const tileset = await seedTileset();
    const svc = service(vi.fn(async () => reply(layout('water'))));
    const created = await svc.library({ op: 'create', repoId: 'r', spec: { kind: 'map', name: 'island', prompt: 'an island', tileset, engine: { kind: 'ollama', model: 'm' } } });
    if (!created.ok) throw new Error('create failed');
    const target = { repoId: 'r', group: 'maps' as const, asset: created.value.asset! };
    const started = await svc.generate(target);
    if (!started.ok) throw new Error(started.kind === 'error' ? started.message : 'generate failed');
    const status = await waitDone(svc, started.value.jobId);
    expect(status).toMatchObject({ state: 'done' });

    const dir = join(root, 'maps', target.asset);
    const tmj = TiledMapSchema.parse(JSON.parse(await readFile(join(dir, 'map.tmj'), 'utf8')));
    expect(tmj.layers.map((l) => l.name)).toEqual(['ground', 'decoration', 'collision', 'objects']);
    expect(tmj.tilesets.map((t) => t.image)).toEqual(['tileset.png', 'collision.png']);
    expect(tmj).toMatchObject({ width: 12, height: 10, tilewidth: 16, tileheight: 16, orientation: 'orthogonal' });
    const spec = parseSpriteSpec(JSON.parse(await readFile(join(dir, 'sprite.json'), 'utf8'))) as Extract<SpriteAssetSpec, { kind: 'map' }>;
    expect(spec.mapSpec?.objects.map((o) => o.name)).toEqual(['player', 'door']);
    expect(spec.lastReport?.frames).toBe(120);

    const exported = await exportSprite({ dir, spec, frames: { version: 1, frames: {}, referenceHeights: {} }, pack: { maxSize: 2048, padding: 2, extrude: 1, pot: true }, dest: join(root, 'out') });
    expect(exported.ok).toBe(true);
    expect((await readdir(join(root, 'out', 'island.map'))).sort()).toEqual(['collision.png', 'map.tmj', 'sprite.json', 'tileset.png', 'tileset.tsj']);
  });

  it('refills the stored layout without asking the engine', async () => {
    const tileset = await seedTileset();
    const llm = vi.fn(async () => reply(layout('water')));
    const svc = service(llm);
    const created = await svc.library({
      op: 'create',
      repoId: 'r',
      spec: { kind: 'map', name: 'kept', tileset, mapSpec: { width: 8, height: 8, base: 'grass', objects: [] } },
    });
    if (!created.ok) throw new Error('create failed');
    const started = await svc.generate({ repoId: 'r', group: 'maps', asset: created.value.asset!, layout: 'keep' });
    if (!started.ok) throw new Error(started.kind === 'error' ? started.message : 'generate failed');
    expect((await waitDone(svc, started.value.jobId)).state).toBe('done');
    expect(llm).not.toHaveBeenCalled();
  });

  it('refuses up front with no tileset, or with no engine for a new layout', () => {
    const base = { kind: 'map' as const, name: 'm' };
    expect(mapPreflight(parseSpriteSpec(base), {})).toBe(MAP_NEEDS_TILESET);
    expect(mapPreflight(parseSpriteSpec({ ...base, tileset: 'x' }), {})).toBe(MAP_NEEDS_ENGINE);
  });
});

describe('importing a .tmj', () => {
  it('embeds an external .tsj beside the map and copies its image', async () => {
    const src = join(root, 'tiled');
    await mkdir(join(src, 'sets'), { recursive: true });
    await writeFile(join(src, 'sets', 'tiles.tsj'), JSON.stringify({ type: 'tileset', name: 'tiles', image: 'tiles.png', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2, imagewidth: 32, imageheight: 32, margin: 0, spacing: 0 }));
    await writeFile(join(src, 'sets', 'tiles.png'), Buffer.from([1, 2, 3]));
    await writeFile(join(src, 'level.tmj'), JSON.stringify({ type: 'map', width: 2, height: 2, infinite: false, layers: [], tilesets: [{ firstgid: 1, source: 'sets/tiles.tsj' }] }));
    const read = await readTmjForImport(join(src, 'level.tmj'));
    if (!read.ok) throw new Error('import failed');
    expect(read.value.name).toBe('level');
    expect([...read.value.files.keys()].sort()).toEqual(['map.tmj', 'tiles.png']);
    const map = JSON.parse(read.value.files.get('map.tmj')!.toString('utf8'));
    expect(map.tilesets[0]).toMatchObject({ firstgid: 1, name: 'tiles', image: 'tiles.png' });
    expect(map.tilesets[0].source).toBeUndefined();
  });

  it('refuses a map whose tileset image is missing', async () => {
    await writeFile(join(root, 'bad.tmj'), JSON.stringify({ type: 'map', width: 2, height: 2, layers: [], tilesets: [{ firstgid: 1, name: 't', image: 'gone.png' }] }));
    expect(await readTmjForImport(join(root, 'bad.tmj'))).toEqual({ ok: false, kind: 'error', message: "This map's tileset image gone.png is missing." });
  });

  it('becomes a map asset with its files', async () => {
    const svc = service(vi.fn());
    const out = await svc.importMap({ repoId: 'r', name: 'level', files: new Map([['map.tmj', Buffer.from('{}')]]), tiles: 4 });
    if (!out.ok) throw new Error('import failed');
    expect(out.value.group).toBe('maps');
    const spec = parseSpriteSpec(JSON.parse(await readFile(join(root, 'maps', out.value.asset!, 'sprite.json'), 'utf8')));
    expect(spec).toMatchObject({ kind: 'map', imported: true, lastReport: { frames: 4, failing: 0 } });
  });
});
