import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  parseTerrainSpec,
  TERRAIN_CLASS_INDICES,
  TERRAIN_MANIFEST_FILE,
  TerrainManifestSchema,
  TerrainRoadsFileSchema,
} from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { encodePngGrey8, encodePngRgba8 } from '../media/png/png-codec';
import { runTerrainBuild } from '../media/terrain/build-pipeline';
import { exportTerrain } from '../media/terrain/terrain-export';

/**
 * The open-world starter's committed terrain pack (Phase 107 Theme J):
 * `templates/media-game/genres/open-world/assets/terrain/fixture.terrain/`, a
 * 257² Phase 105 pack built from the noise preset with a plus-shaped roads
 * mask, so the starter runs before anyone imports a real terrain.
 *
 * It is produced by Phase 105's own build + export, never hand-written, so it
 * is exactly what a user's export looks like. Regenerate with
 * `MSTUDIO_REGEN_OPEN_WORLD_FIXTURE=1 pnpm --filter @midnite/studio-desktop exec vitest run src/main/games/open-world-fixture.test.ts`.
 */

const PACK = resolve(__dirname, '../../../../../templates/media-game/genres/open-world/assets/terrain/fixture.terrain');
const MAX_BYTES = 2 * 1024 * 1024;

/** 1024 px over 512 m: half a metre a pixel. Roads run through the centre, 12 m wide. */
const RES = 1024;

async function dirBytes(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const p = join(path, entry.name);
    total += entry.isDirectory() ? await dirBytes(p) : (await stat(p)).size;
  }
  return total;
}

type Cls = keyof typeof TERRAIN_CLASS_INDICES;
/** Four buildings in the north-east block, clear of both roads (centre 512, half-width ~24 px). */
const BLOCKS = [[580, 380], [680, 380], [580, 280], [700, 260]] as const;

/** The fixture's land cover at `RES`: grass, a wood, a pond, a few blocks by the junction. */
function classAt(x: number, y: number): Cls {
  for (const [bx, by] of BLOCKS) if (x >= bx && x < bx + 60 && y >= by && y < by + 50) return 'building';
  if (Math.hypot(x - 760, y - 780) < 110) return 'water';
  if (Math.hypot(x - 260, y - 260) < 150) return 'tree';
  if (Math.abs(x - 512) < 12 || Math.abs(y - 512) < 12) return 'road';
  return 'grass';
}

/** The class brush's override layer (class index + 1), so the classes are exact rather than k-means' guess. */
function overrides(): Uint8Array {
  const out = new Uint8Array(RES * RES);
  for (let y = 0; y < RES; y += 1) for (let x = 0; x < RES; x += 1) out[y * RES + x] = TERRAIN_CLASS_INDICES[classAt(x, y)] + 1;
  return out;
}

/** A painted "satellite" image of the same layout, which becomes the drape the ground is textured with. */
const SAT_RGB: Record<Cls, [number, number, number]> = {
  grass: [104, 142, 74], tree: [46, 84, 44], water: [52, 98, 150], building: [150, 140, 128],
  road: [66, 66, 70], bare: [160, 130, 96], rock: [120, 120, 120], other: [120, 120, 120],
};
function satellite(n: number): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  const k = RES / n;
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) out.set([...SAT_RGB[classAt(x * k, y * k)], 255], (y * n + x) * 4);
  return out;
}

/**
 * Trim the export to the 2 MB budget without changing what the kit reads: LOD 0 (2.5 MB on its own)
 * goes — the kit shows each chunk at the nearest loaded level — and so do the splat map and the
 * material tiles, which only the Terrain page's own preview uses.
 */
async function trim(pack: string): Promise<void> {
  const path = join(pack, TERRAIN_MANIFEST_FILE);
  const manifest = TerrainManifestSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  for (const l of manifest.chunks.lods.filter((x) => x.lod === 0)) await rm(join(pack, l.glb));
  manifest.chunks.lods = manifest.chunks.lods.filter((x) => x.lod !== 0);
  if (manifest.maps.splat) await rm(join(pack, manifest.maps.splat));
  delete manifest.maps.splat;
  delete manifest.materials;
  await rm(join(pack, 'materials'), { recursive: true, force: true });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function buildFixture(dest: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'open-world-fixture-'));
  try {
    await mkdir(join(dir, 'inputs'));
    await mkdir(join(dir, 'overrides'));
    const n = 256;
    await writeFile(join(dir, 'inputs', 'satellite.png'), encodePngRgba8(satellite(n), n, n));
    // The plus: two cyan bars through the centre of a 256² mask, inset from the edges.
    const m = 256;
    const roads = new Uint8Array(m * m * 4);
    for (let y = 0; y < m; y += 1) {
      for (let x = 0; x < m; x += 1) {
        const across = y >= 125 && y < 131 && x >= 16 && x < 240;
        const down = x >= 125 && x < 131 && y >= 16 && y < 240;
        roads.set(across || down ? [0, 255, 255, 255] : [0, 0, 0, 255], (y * m + x) * 4);
      }
    }
    await writeFile(join(dir, 'inputs', 'roads.png'), encodePngRgba8(roads, m, m));
    await writeFile(join(dir, 'overrides', 'landcover.png'), encodePngGrey8(overrides(), RES, RES));

    const spec = parseTerrainSpec({
      name: 'fixture',
      resolution: 257,
      worldSize: 512,
      heightRange: [0, 24],
      textureSize: 1024,
      noise: { seed: 7, frequency: 1.5, octaves: 5, erosion: { iterations: 0 } },
      inputs: {
        satellite: { file: 'inputs/satellite.png', sourceName: 'satellite.png', width: n, height: n, bitDepth: 8 },
        roads: { file: 'inputs/roads.png', sourceName: 'roads.png', width: m, height: m, bitDepth: 8 },
      },
      foliage: { treeDensity: 2, grassDensity: 0, margin: 3 },
      buildings: { height: [6, 14] },
    });
    await runTerrainBuild({ dir, outDir: 'build', spec });
    const out = await mkdtemp(join(tmpdir(), 'open-world-fixture-out-'));
    const r = await exportTerrain({
      dir,
      spec,
      options: { format: 'terrain-pack', dest: out, lod: 0, texture: 'none', foliage: true, roads: true, buildings: true },
    });
    if (!r.ok) throw new Error(r.message);
    await rm(dest, { recursive: true, force: true });
    await mkdir(join(dest, '..'), { recursive: true });
    await rename(r.value.path, dest);
    await trim(dest);
    await rm(out, { recursive: true, force: true });
    return dest;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe.runIf(process.env.MSTUDIO_REGEN_OPEN_WORLD_FIXTURE === '1')('regenerate the open-world fixture pack', () => {
  it('builds and exports it through Phase 105', async () => {
    await buildFixture(PACK);
    expect(existsSync(join(PACK, TERRAIN_MANIFEST_FILE))).toBe(true);
  }, 300_000);
});

describe('the committed open-world fixture pack', () => {
  it('is a valid Phase 105 pack under 2 MB, every listed file present', async () => {
    const manifest = TerrainManifestSchema.parse(JSON.parse(await readFile(join(PACK, TERRAIN_MANIFEST_FILE), 'utf8')));
    expect(manifest).toMatchObject({ version: 1, generator: 'midnite-studio', worldSize: 512 });
    const listed = [
      manifest.heightfield.png,
      manifest.heightfield.json,
      ...manifest.chunks.lods.map((l) => l.glb),
      ...Object.values(manifest.maps),
      ...[manifest.foliage, manifest.buildings, manifest.roads].filter((v): v is string => typeof v === 'string'),
      ...(manifest.foliageAssets ?? []).map((a) => a.glb),
    ];
    for (const file of listed) expect(existsSync(join(PACK, file)), file).toBe(true);
    expect(manifest.maps.landcover).toBeDefined();
    expect(manifest.chunks.lods.map((l) => l.lod)).toEqual([1, 2, 3]);
    expect(manifest.maps.landcoverLegend).toBeDefined();
    const heightfield = JSON.parse(await readFile(join(PACK, manifest.heightfield.json), 'utf8')) as { resolution: number };
    expect(heightfield.resolution).toBe(257);
    expect(await dirBytes(PACK)).toBeLessThan(MAX_BYTES);
  });

  it('has a plus-shaped road graph: one 4-way junction and four dead ends', async () => {
    const roads = TerrainRoadsFileSchema.parse(JSON.parse(await readFile(join(PACK, 'roads.json'), 'utf8')));
    const degrees = roads.nodes.map((node) => node.degree).sort();
    expect(degrees).toEqual([1, 1, 1, 1, 4]);
    expect(roads.edges).toHaveLength(4);
  });
});
