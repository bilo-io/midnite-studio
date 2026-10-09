// vitest/jsdom-free (node): export needs no browser capability. The glb is re-imported through
// three's GLTFLoader (the export-fidelity.test.ts pattern); texture decoding needs a DOM, so the
// textured variant is asserted on the glb's JSON chunk instead.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseTerrainSpec, TERRAIN_MANIFEST_FILE, TerrainFoliageFileSchema, TerrainManifestSchema, type TerrainSpec } from '@midnite/studio-shared';
import { InstancedMesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { decodePng, encodePngRgba8 } from '../png/png-codec';
import { runTerrainBuild } from './build-pipeline';
import { exportTerrain, NOT_BUILT_MESSAGE, quantiseHeights } from './terrain-export';

let dir: string;
let dest: string;
let spec: TerrainSpec;
let heights: Float32Array;

const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const base = { dest: '', lod: 1, texture: 'none' as const, foliage: true, roads: true, buildings: true };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'terrain-export-'));
  dest = await mkdtemp(join(tmpdir(), 'terrain-export-dest-'));
  await mkdir(join(dir, 'inputs'));
  const n = 64;
  const rgba = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i += 1) rgba.set(i % n < n / 2 ? [40, 130, 40, 255] : [140, 130, 110, 255], i * 4);
  await writeFile(join(dir, 'inputs', 'satellite.png'), encodePngRgba8(rgba, n, n));
  spec = parseTerrainSpec({
    name: 'Fixture Isle',
    resolution: 129,
    worldSize: 1000,
    heightRange: [0, 120],
    noise: { seed: 3, erosion: { iterations: 0 } },
    inputs: { satellite: { file: 'inputs/satellite.png', sourceName: 's.png', width: n, height: n, bitDepth: 8 } },
  });
  await runTerrainBuild({ dir, outDir: 'build', spec });
  const raw = await readFile(join(dir, 'build', 'heights.f32'));
  heights = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
});

describe('exportTerrain', () => {
  it('refuses a terrain that has not been built', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'terrain-export-empty-'));
    const r = await exportTerrain({ dir: empty, spec, options: { ...base, format: 'terrain-pack', dest } });
    await rm(empty, { recursive: true, force: true });
    expect(r).toEqual({ ok: false, kind: 'error', message: NOT_BUILT_MESSAGE });
  });

  it('writes a pack whose manifest validates and whose every path exists', async () => {
    const r = await exportTerrain({ dir, spec, options: { ...base, format: 'terrain-pack', dest } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.path).toBe(join(dest, 'fixture-isle.terrain'));
    expect(r.value.bytes).toBeGreaterThan(0);
    const manifest = TerrainManifestSchema.parse(JSON.parse(await readFile(join(r.value.path, TERRAIN_MANIFEST_FILE), 'utf8')));
    expect(manifest).toMatchObject({ version: 1, generator: 'midnite-studio', worldSize: 1000, heightRange: [0, 120] });
    expect(manifest.chunks.lods.map((l) => l.lod)).toEqual([0, 1, 2, 3]);
    const listed: string[] = [
      manifest.heightfield.png,
      manifest.heightfield.json,
      ...manifest.chunks.lods.map((l) => l.glb),
      ...Object.values(manifest.maps).filter((v): v is string => typeof v === 'string'),
      ...(manifest.materials ? Object.values(manifest.materials).flatMap((m) => [m.albedo, m.normal]) : []),
      ...[manifest.foliage, manifest.buildings, manifest.roads].filter((v): v is string => typeof v === 'string'),
      ...(manifest.foliageAssets ?? []).map((a) => a.glb),
    ];
    expect(manifest.maps.drape).toBe('maps/drape.png');
    for (const rel of listed) expect(existsSync(join(r.value.path, rel)), rel).toBe(true);
    expect(manifest.bounds.min[1]).toBeLessThanOrEqual(manifest.bounds.max[1]);
  });

  it('round-trips the heightfield png bit-exactly through the decoder', async () => {
    const png = decodePng(await readFile(join(dest, 'fixture-isle.terrain', 'heightfield.png')));
    expect(png.ok).toBe(true);
    if (!png.ok) return;
    expect(png.image).toMatchObject({ width: 129, height: 129, channels: 1, bitDepth: 16 });
    expect(Array.from(png.image.data)).toEqual(Array.from(quantiseHeights(heights, [0, 120])));
    const json = JSON.parse(await readFile(join(dest, 'fixture-isle.terrain', 'heightfield.json'), 'utf8'));
    expect(json).toEqual({ version: 1, resolution: 129, worldSize: 1000, heightRange: [0, 120], rowMajor: 'z', origin: 'centre' });
  });

  it('refuses to overwrite an existing pack', async () => {
    const r = await exportTerrain({ dir, spec, options: { ...base, format: 'terrain-pack', dest } });
    expect(r).toEqual({ ok: false, kind: 'error', message: 'fixture-isle.terrain already exists in that folder.' });
  });

  it('writes a glb that re-imports with one node per chunk plus roads, buildings and foliage', async () => {
    const r = await exportTerrain({ dir, spec, options: { ...base, format: 'glb', dest } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.path).toBe(join(dest, 'fixture-isle.glb'));
    const gltf = await new GLTFLoader().parseAsync(ab(await readFile(r.value.path)), '');
    const names: string[] = [];
    const instanced: InstancedMesh[] = [];
    gltf.scene.traverse((o: Object3D) => {
      names.push(o.name);
      if ((o as InstancedMesh).isInstancedMesh) instanced.push(o as InstancedMesh);
    });
    expect(names.filter((n) => /^chunk_\d+_\d+$/.test(n))).toHaveLength(4);
    const foliage = TerrainFoliageFileSchema.parse(JSON.parse(await readFile(join(dir, 'build', 'foliage.json'), 'utf8')));
    const used = new Set(foliage.instances.map((i) => i[0]));
    expect(used.size).toBeGreaterThan(0);
    expect(instanced).toHaveLength(used.size);
  }, 30_000);

  it('embeds the drape as the chunk base-colour texture', async () => {
    const r = await exportTerrain({ dir, spec, options: { ...base, format: 'glb', dest, texture: 'drape', foliage: false, roads: false, buildings: false } });
    expect(r.ok).toBe(false); // fixture-isle.glb already exists from the previous case
    const fresh = await mkdtemp(join(tmpdir(), 'terrain-export-tex-'));
    const t = await exportTerrain({ dir, spec, options: { ...base, format: 'glb', dest: fresh, texture: 'drape' } });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    const buf = await readFile(t.value.path);
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    await rm(fresh, { recursive: true, force: true });
    expect(json.images).toHaveLength(1);
    expect(json.materials.some((m: { pbrMetallicRoughness?: { baseColorTexture?: unknown } }) => m.pbrMetallicRoughness?.baseColorTexture)).toBe(true);
  }, 30_000);
});
