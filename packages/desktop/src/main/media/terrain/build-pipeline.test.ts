import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseTerrainSpec,
  TERRAIN_CLASS_INDICES,
  TerrainBuildingsFileSchema,
  TerrainChunksFileSchema,
  TerrainFoliageFileSchema,
  TerrainRoadsFileSchema,
  type TerrainBuildStage,
} from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { encodePngGrey16, encodePngGrey8, encodePngRgba8 } from '../png/png-codec';
import { plannedStages, runTerrainBuild } from './build-pipeline';

const MASK_ONLY_ROADS_SHA256 = '5b302b0b11ee7200a9b3eede361bf4cefbf3f55a0027823505dc71983869edcf';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'terrain-build-'));
  await mkdir(join(dir, 'inputs'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const specFor = (width: number, height: number, bitDepth: 8 | 16, extra: Record<string, unknown> = {}) =>
  parseTerrainSpec({
    inputs: { heightmap: { file: 'inputs/heightmap.png', sourceName: 'h.png', width, height, bitDepth } },
    resolution: 129,
    worldSize: 1000,
    heightRange: [0, 100],
    ...extra,
  });

describe('runTerrainBuild', () => {
  it('writes heights.f32 and chunks.json from a 16-bit heightmap and returns the stats', async () => {
    const n = 8;
    const data = new Uint16Array(n * n).map((_, i) => Math.round(((i % n) / (n - 1)) * 65535)); // west-to-east ramp
    await writeFile(join(dir, 'inputs', 'heightmap.png'), encodePngGrey16(data, n, n));
    const progress: Array<[TerrainBuildStage, number]> = [];
    const stats = await runTerrainBuild({ dir, outDir: 'out', spec: specFor(n, n, 16) }, (s, f) => progress.push([s, f]));

    const raw = await readFile(join(dir, 'out', 'heights.f32'));
    const heights = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
    expect(heights).toHaveLength(129 * 129);
    expect(heights[0]).toBeCloseTo(0, 3);
    expect(heights[128]).toBeCloseTo(100, 3);
    expect(heights[64]).toBeCloseTo(50, 0);

    const chunks = TerrainChunksFileSchema.parse(JSON.parse(await readFile(join(dir, 'out', 'chunks.json'), 'utf8')));
    expect(chunks).toMatchObject({ resolution: 129, chunkVerts: 65, chunksPerSide: 2, lodCount: 4 });
    expect(chunks.chunks).toHaveLength(4);

    expect(stats).toMatchObject({ resolution: 129, vertexCount: 129 * 129, triangleCount: 128 * 128 * 2, chunkCount: 4, lodCount: 4 });
    expect(stats.minHeight).toBeCloseTo(0, 3);
    expect(stats.maxHeight).toBeCloseTo(100, 3);
    expect(stats.histogram.reduce((a, b) => a + b, 0)).toBe(129 * 129);
    expect(stats.warnings).toEqual([]);
    expect(progress.map(([s]) => s)).toEqual(expect.arrayContaining(['decode', 'heightfield', 'write']));
    expect(progress.at(-1)).toEqual(['write', 1]);
  });

  it('warns about an 8-bit and a non-square heightmap', async () => {
    await writeFile(join(dir, 'inputs', 'heightmap.png'), encodePngRgba8(new Uint8Array(4 * 4 * 2).fill(128), 4, 2));
    const stats = await runTerrainBuild({ dir, outDir: 'out', spec: specFor(4, 2, 8) });
    expect(stats.warnings).toEqual(['8-bit heightmap: expect visible terracing. Pre-smooth is on.', 'Non-square heightmap stretched to a square extent.']);
  });

  it('fails readably on a damaged or missing heightmap', async () => {
    await expect(runTerrainBuild({ dir, outDir: 'out', spec: specFor(2, 2, 16) })).rejects.toThrow('The heightmap file is missing');
    await writeFile(join(dir, 'inputs', 'heightmap.png'), Buffer.from('nope'));
    await expect(runTerrainBuild({ dir, outDir: 'out', spec: specFor(2, 2, 16) })).rejects.toThrow('This PNG is damaged and cannot be read.');
  });

  it('plans the stages a spec has work for', () => {
    expect(plannedStages(specFor(2, 2, 16))).toEqual(['decode', 'heightfield', 'write']);
    const noisy = parseTerrainSpec({ noise: { seed: 1, erosion: { iterations: 100 } } });
    expect(plannedStages(noisy)).toEqual(['heightfield', 'erosion', 'write']);
    expect(plannedStages(parseTerrainSpec({ noise: { seed: 1, erosion: { iterations: 0 } } }))).toEqual(['heightfield', 'write']);
    const roads = { file: 'inputs/roads.png', sourceName: 'r.png', width: 4, height: 4, bitDepth: 8 };
    const satellite = { file: 'inputs/satellite.png', sourceName: 's.png', width: 4, height: 4, bitDepth: 8 };
    expect(plannedStages(parseTerrainSpec({ noise: { seed: 1, erosion: { iterations: 0 } }, inputs: { roads } }))).toEqual(['heightfield', 'roads', 'conform', 'write']);
    expect(plannedStages(parseTerrainSpec({ noise: { seed: 1, erosion: { iterations: 0 } }, inputs: { roads, satellite } }))).toEqual([
      'heightfield', 'drape', 'landcover', 'splat', 'roads', 'conform', 'foliage', 'buildings', 'write',
    ]);
  });

  it('builds a noise terrain with no heightmap, reproducibly from its seed', async () => {
    const spec = parseTerrainSpec({ resolution: 129, worldSize: 500, heightRange: [10, 90], noise: { seed: 5, octaves: 4, erosion: { iterations: 200 } } });
    const stages: TerrainBuildStage[] = [];
    const a = await runTerrainBuild({ dir, outDir: 'a', spec }, (s) => stages.push(s));
    const b = await runTerrainBuild({ dir, outDir: 'b', spec });
    expect(new Set(stages)).toEqual(new Set(['heightfield', 'erosion', 'write']));
    expect(a.minHeight).toBeCloseTo(10, 3);
    expect(a.maxHeight).toBeCloseTo(90, 3);
    expect(a.warnings).toEqual([]);
    const [fa, fb] = await Promise.all([readFile(join(dir, 'a', 'heights.f32')), readFile(join(dir, 'b', 'heights.f32'))]);
    expect(fa.equals(fb)).toBe(true);
    expect(b.vertexCount).toBe(129 * 129);
  });

  it('refuses a spec with neither a heightmap nor noise', async () => {
    await expect(runTerrainBuild({ dir, outDir: 'x', spec: parseTerrainSpec({}) })).rejects.toThrow('Nothing to shape the ground from');
  });

  it('writes drape.png, landcover.png, landcover.json and splat.png when satellite image is present', async () => {
    const n = 8;
    const data = new Uint16Array(n * n).fill(32768);
    await writeFile(join(dir, 'inputs', 'heightmap.png'), encodePngGrey16(data, n, n));

    const satRgba = new Uint8Array(16 * 16 * 4).fill(128);
    await writeFile(join(dir, 'inputs', 'satellite.png'), encodePngRgba8(satRgba, 16, 16));

    const spec = specFor(n, n, 16, {
      inputs: {
        heightmap: { file: 'inputs/heightmap.png', sourceName: 'h.png', width: n, height: n, bitDepth: 16 },
        satellite: { file: 'inputs/satellite.png', sourceName: 'sat.png', width: 16, height: 16, bitDepth: 8 },
      },
      textureSize: 1024,
    });

    const stages: TerrainBuildStage[] = [];
    const stats = await runTerrainBuild({ dir, outDir: 'out', spec }, (s) => stages.push(s));

    expect(stages).toEqual(expect.arrayContaining(['drape', 'landcover', 'splat']));
    expect(stats.classPercent).toBeDefined();

    const drapeBuf = await readFile(join(dir, 'out', 'drape.png'));
    expect(drapeBuf.length).toBeGreaterThan(0);

    const landcoverBuf = await readFile(join(dir, 'out', 'landcover.png'));
    expect(landcoverBuf.length).toBeGreaterThan(0);

    const landcoverJson = JSON.parse(await readFile(join(dir, 'out', 'landcover.json'), 'utf8'));
    expect(landcoverJson).toHaveProperty('classes');
    expect(landcoverJson).toHaveProperty('colours');
    expect(landcoverJson).toHaveProperty('percent');

    const splatBuf = await readFile(join(dir, 'out', 'splat.png'));
    expect(splatBuf.length).toBeGreaterThan(0);
  }, 15_000);

  it('traces roads, scatters foliage off them and raises a building (Themes G + H)', async () => {
    const n = 8;
    await writeFile(join(dir, 'inputs', 'heightmap.png'), encodePngGrey16(new Uint16Array(n * n).fill(32768), n, n));
    await writeFile(join(dir, 'inputs', 'satellite.png'), encodePngRgba8(new Uint8Array(16 * 16 * 4).fill(128), 16, 16));
    // A cyan road across the middle of a 256² mask: 4 px → ~16 m at 1000 m / 1024 px.
    const roads = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) roads.set(y >= 126 && y < 130 && x >= 8 && x < 248 ? [0, 255, 255, 255] : [0, 0, 0, 255], (y * 256 + x) * 4);
    }
    await writeFile(join(dir, 'inputs', 'roads.png'), encodePngRgba8(roads, 256, 256));
    // The class brush's override layer decides the land cover: grass everywhere, one 40 px building.
    const res = 1024;
    const overrides = new Uint8Array(res * res).fill(TERRAIN_CLASS_INDICES.grass + 1);
    for (let y = 200; y < 240; y += 1) for (let x = 200; x < 240; x += 1) overrides[y * res + x] = TERRAIN_CLASS_INDICES.building + 1;
    await mkdir(join(dir, 'overrides'));
    await writeFile(join(dir, 'overrides', 'landcover.png'), encodePngGrey8(overrides, res, res));

    const spec = specFor(n, n, 16, {
      inputs: {
        heightmap: { file: 'inputs/heightmap.png', sourceName: 'h.png', width: n, height: n, bitDepth: 16 },
        satellite: { file: 'inputs/satellite.png', sourceName: 's.png', width: 16, height: 16, bitDepth: 8 },
        roads: { file: 'inputs/roads.png', sourceName: 'r.png', width: 256, height: 256, bitDepth: 8 },
      },
      textureSize: 1024,
      foliage: { treeDensity: 0, grassDensity: 0.5, margin: 2 },
    });
    const stages: TerrainBuildStage[] = [];
    const stats = await runTerrainBuild({ dir, outDir: 'out', spec }, (s) => stages.push(s));
    expect(stages).toEqual(expect.arrayContaining(['roads', 'conform', 'foliage', 'buildings']));

    const read = async (f: string): Promise<unknown> => JSON.parse(await readFile(join(dir, 'out', f), 'utf8'));
    const roadsFile = TerrainRoadsFileSchema.parse(await read('roads.json'));
    expect(roadsFile.edges).toHaveLength(1);
    const road = roadsFile.edges[0]!;
    expect(road.widthM).toBeGreaterThan(12);
    expect(road.widthM).toBeLessThan(20);
    expect(road.kind).toBe('avenue');
    expect(road.lengthM).toBeGreaterThan(800);

    const foliage = TerrainFoliageFileSchema.parse(await read('foliage.json'));
    expect(foliage.assets).toEqual(['pine', 'broadleaf', 'birch', 'grass-clump', 'bush']);
    expect(foliage.instances.every(([asset]) => asset >= 3)).toBe(true);
    expect(foliage.instances.length).toBeGreaterThan(100);
    // Nothing grows on the road (centre z ≈ 0, half-width ~8 m, margin 2 m; it ends near |x| = 470 m).
    for (const [, x, , z] of foliage.instances) if (Math.abs(x) < 450) expect(Math.abs(z)).toBeGreaterThan(8);

    const buildings = TerrainBuildingsFileSchema.parse(await read('buildings.json'));
    expect(buildings.buildings).toHaveLength(1);
    expect(buildings.buildings[0]!.polygon).toHaveLength(4);
    expect(buildings.buildings[0]!.baseY).toBeCloseTo(50, 0);

    expect(stats).toMatchObject({ roadCount: 1, buildingCount: 1, foliageCount: foliage.instances.length });
    expect(stats.roadLengthM).toBeGreaterThan(800);
    expect(stats.roadAgreement).toBe(0);
    expect((await readFile(join(dir, 'out', 'roads-mask.png'))).length).toBeGreaterThan(0);
  }, 60_000);

  describe('captured road graph (Phase 108 Theme F)', () => {
    const n = 8;
    const maskSpec = (extra: Record<string, unknown> = {}) =>
      specFor(n, n, 16, {
        inputs: {
          heightmap: { file: 'inputs/heightmap.png', sourceName: 'h.png', width: n, height: n, bitDepth: 16 },
          satellite: { file: 'inputs/satellite.png', sourceName: 's.png', width: 16, height: 16, bitDepth: 8 },
          roads: { file: 'inputs/roads.png', sourceName: 'r.png', width: 256, height: 256, bitDepth: 8 },
          ...extra,
        },
        textureSize: 1024,
        foliage: { treeDensity: 0, grassDensity: 0.5, margin: 2 },
      });
    async function seed(): Promise<void> {
      await writeFile(join(dir, 'inputs', 'heightmap.png'), encodePngGrey16(new Uint16Array(n * n).fill(32768), n, n));
      await writeFile(join(dir, 'inputs', 'satellite.png'), encodePngRgba8(new Uint8Array(16 * 16 * 4).fill(128), 16, 16));
      const roads = new Uint8Array(256 * 256 * 4);
      for (let y = 0; y < 256; y += 1) {
        for (let x = 0; x < 256; x += 1) roads.set(y >= 126 && y < 130 && x >= 8 && x < 248 ? [0, 255, 255, 255] : [0, 0, 0, 255], (y * 256 + x) * 4);
      }
      await writeFile(join(dir, 'inputs', 'roads.png'), encodePngRgba8(roads, 256, 256));
    }

    it('a mask-only terrain writes the same roads.json bytes as before the graph path existed', async () => {
      await seed();
      await runTerrainBuild({ dir, outDir: 'out', spec: maskSpec() }, () => undefined);
      const raw = await readFile(join(dir, 'out', 'roads.json'), 'utf8');
      expect(raw).not.toContain('"cls"');
      expect(raw).not.toContain('"name"');
      // Pinned from the pre-Theme-F pipeline over this exact fixture.
      expect(createHash('sha256').update(raw).digest('hex')).toBe(MASK_ONLY_ROADS_SHA256);
    }, 60_000);

    it('uses the captured graph: widths from widthM, cls and name carried into roads.json', async () => {
      await seed();
      const graph = {
        version: 1,
        worldSize: 1000,
        nodes: [
          { id: 10, p: [-400, 0] },
          { id: 11, p: [400, 0] },
        ],
        edges: [{ id: 5, a: 10, b: 11, points: [[-400, 0], [0, 0], [400, 0]], cls: 'primary', name: 'Main Road', widthM: 14, osmWayId: 42 }],
      };
      await writeFile(join(dir, 'inputs', 'roads.graph.json'), JSON.stringify(graph));
      const spec = maskSpec({ roadsGraph: { file: 'inputs/roads.graph.json', edges: 1 } });
      const stats = await runTerrainBuild({ dir, outDir: 'out', spec }, () => undefined);
      const file = TerrainRoadsFileSchema.parse(JSON.parse(await readFile(join(dir, 'out', 'roads.json'), 'utf8')));
      expect(file.edges).toHaveLength(1);
      expect(file.edges[0]).toMatchObject({ cls: 'primary', name: 'Main Road', widthM: 14, kind: 'avenue' });
      expect(file.edges[0]!.lengthM).toBeCloseTo(800, 0);
      expect(stats.warnings).not.toContain('The captured road graph could not be read — roads come from the mask instead.');
    }, 60_000);

    it('falls back to the mask, with a warning, when the captured graph is unreadable', async () => {
      await seed();
      await writeFile(join(dir, 'inputs', 'roads.graph.json'), '{nope');
      const spec = maskSpec({ roadsGraph: { file: 'inputs/roads.graph.json', edges: 1 } });
      const stats = await runTerrainBuild({ dir, outDir: 'out', spec }, () => undefined);
      expect(stats.warnings.join('\n')).toContain('captured road graph could not be read');
      const file = TerrainRoadsFileSchema.parse(JSON.parse(await readFile(join(dir, 'out', 'roads.json'), 'utf8')));
      expect(file.edges).toHaveLength(1);
      expect(file.edges[0]!.cls).toBeUndefined();
    }, 60_000);
  });
});
