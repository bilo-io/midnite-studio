import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseTerrainSpec, TerrainChunksFileSchema, type TerrainBuildStage } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { encodePngGrey16, encodePngRgba8 } from '../png/png-codec';
import { plannedStages, runTerrainBuild } from './build-pipeline';

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
});

