import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildingsMesh,
  BUILDING_WALL_RGB,
  builtInFoliageDesign,
  chunkMesh,
  chunksPerSide,
  DEFAULT_MATERIAL,
  failure,
  foliageGeometry,
  modelAssetHash,
  ok,
  registerModelAsset,
  roadMeshes,
  TERRAIN_LOD_COUNT,
  TERRAIN_MANIFEST_FILE,
  terrainExistsMessage,
  terrainSlug,
  TerrainBuildingsFileSchema,
  TerrainChunksFileSchema,
  TerrainFoliageFileSchema,
  TerrainManifestSchema,
  TerrainRoadsFileSchema,
  type GitOpResult,
  type Heightfield,
  type MeshPart,
  type TerrainBuildingsFile,
  type TerrainExportOptions,
  type TerrainExportResult,
  type TerrainFoliageFile,
  type TerrainHeightfieldJson,
  type TerrainManifest,
  type TerrainRoadsFile,
  type TerrainSpec,
} from '@midnite/studio-shared';

import { writeGlb, type GltfInstancing } from '../model/gltf-writer';
import { decodePng, encodePngGrey16, encodePngRgba8 } from '../png/png-codec';

/**
 * Terrain export (Phase 105 Theme I): a `.terrain` pack folder (the contract Phase 107's kit reads)
 * or one `.glb`. Both are written from `build/` — the terrain must have been built — and refuse to
 * overwrite. The pack is assembled in a sibling temp folder and renamed into place, so a failure
 * leaves nothing half-written behind.
 */
export const NOT_BUILT_MESSAGE = 'Build the terrain before exporting it.';

const TERRAIN_RGB = '#7d8c5f';
const ROAD_RGB = '#3a3a3d';
const MAX_BAKE = 2048;
const MATERIAL_NAMES = ['grass', 'rock', 'dirt', 'snow'] as const;

export type Built = {
  dir: string;
  build: string;
  field: Heightfield;
  chunksPerSide: number;
  verts: number;
  roads: TerrainRoadsFile | null;
  buildings: TerrainBuildingsFile | null;
  foliage: TerrainFoliageFile | null;
};

const has = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

async function readJson<T>(path: string, parse: (v: unknown) => T): Promise<T | null> {
  const text = await readFile(path, 'utf8').catch(() => null);
  return text === null ? null : parse(JSON.parse(text));
}

export async function loadBuilt(dir: string): Promise<GitOpResult<Built>> {
  const build = join(dir, 'build');
  const chunks = await readJson(join(build, 'chunks.json'), (v) => TerrainChunksFileSchema.parse(v));
  const raw = await readFile(join(build, 'heights.f32')).catch(() => null);
  if (!chunks || !raw) return failure(NOT_BUILT_MESSAGE);
  const heights = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
  if (heights.length !== chunks.resolution * chunks.resolution) return failure('The build is damaged — build the terrain again.');
  return ok({
    dir,
    build,
    field: { resolution: chunks.resolution, worldSize: chunks.worldSize, heights },
    chunksPerSide: chunks.chunksPerSide,
    verts: chunks.chunkVerts,
    roads: await readJson(join(build, 'roads.json'), (v) => TerrainRoadsFileSchema.parse(v)),
    buildings: await readJson(join(build, 'buildings.json'), (v) => TerrainBuildingsFileSchema.parse(v)),
    foliage: await readJson(join(build, 'foliage.json'), (v) => TerrainFoliageFileSchema.parse(v)),
  });
}

const flat = (v: ArrayLike<number>): number[] => Array.from(v);

export function terrainMeshPart(name: string, color: string, positions: ArrayLike<number>, normals: ArrayLike<number>, indices: ArrayLike<number>, uvs?: ArrayLike<number>, texture?: string): MeshPart {
  return {
    name,
    color,
    material: { ...DEFAULT_MATERIAL, roughness: 0.9 },
    positions: flat(positions),
    normals: flat(normals),
    indices: flat(indices),
    sourceIndex: 0,
    role: 'solid',
    ...(uvs ? { uvs: flat(uvs) } : {}),
    ...(texture ? { texture } : {}),
  };
}

/** One part per chunk at `lod`, named `chunk_<cx>_<cz>` — the node names Phase 107 streams by. */
function chunkParts(b: Built, heightRange: readonly [number, number], lod: number, texture?: string): MeshPart[] {
  const parts: MeshPart[] = [];
  for (let cz = 0; cz < b.chunksPerSide; cz += 1) {
    for (let cx = 0; cx < b.chunksPerSide; cx += 1) {
      const m = chunkMesh(b.field, cx, cz, lod, heightRange);
      parts.push(terrainMeshPart(`chunk_${cx}_${cz}`, texture ? '#ffffff' : TERRAIN_RGB, m.positions, m.normals, m.indices, texture ? m.uvs : undefined, texture));
    }
  }
  return parts;
}

function mergedRoads(b: Built): MeshPart | null {
  if (!b.roads || b.roads.edges.length === 0) return null;
  const pieces = roadMeshes(b.roads, b.field);
  if (pieces.length === 0) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const p of pieces) {
    const base = positions.length / 3;
    positions.push(...flat(p.positions));
    normals.push(...flat(p.normals));
    for (const i of p.indices) indices.push(i + base);
  }
  return terrainMeshPart('roads', ROAD_RGB, positions, normals, indices);
}

const toHex = (rgb: readonly number[]): string => `#${rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;

function mergedBuildings(b: Built): MeshPart | null {
  if (!b.buildings || b.buildings.buildings.length === 0) return null;
  const m = buildingsMesh(b.buildings.buildings);
  return terrainMeshPart('buildings', toHex(BUILDING_WALL_RGB), m.positions, m.normals, m.indices);
}

/** Foliage instances grouped per asset. Only built-in designs can be drawn; others are named in `skipped`. */
function foliageInstancing(b: Built): { instancing: GltfInstancing; assets: string[]; skipped: string[] } {
  const meshes: GltfInstancing['meshes'] = [];
  const assets: string[] = [];
  const skipped: string[] = [];
  const file = b.foliage;
  if (!file) return { instancing: { meshes }, assets, skipped };
  file.assets.forEach((asset, index) => {
    const design = builtInFoliageDesign(asset);
    if (!design) {
      skipped.push(asset);
      return;
    }
    const mine = file.instances.filter((inst) => inst[0] === index);
    if (mine.length === 0) return;
    const geo = foliageGeometry(design);
    const translations = new Float32Array(mine.length * 3);
    const rotations = new Float32Array(mine.length * 4);
    const scales = new Float32Array(mine.length * 3);
    mine.forEach(([, x, y, z, yaw, scale], i) => {
      translations.set([x, y, z], i * 3);
      rotations.set([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], i * 4);
      scales.set([scale, scale, scale], i * 3);
    });
    meshes.push({ part: terrainMeshPart(asset, '#ffffff', geo.positions, geo.normals, geo.indices), translations, rotations, scales, colors: geo.colors });
    assets.push(asset);
  });
  return { instancing: { meshes }, assets, skipped };
}

/** Registers `png` as a texture the glTF writer can embed, and returns its hash. */
function registerTexture(png: Uint8Array): string {
  const hash = modelAssetHash(png);
  registerModelAsset(hash, {
    positions: [],
    normals: [],
    indices: [],
    uvs: null,
    texture: { mime: 'image/png', data: png },
    material: { color: '#ffffff', metalness: 0, roughness: 1 },
  });
  return hash;
}

/** A `textureSize²` bake of the splat blend, each material contributing its tile's mean colour. */
async function bakeSplat(b: Built, size: number): Promise<Uint8Array | null> {
  const splatBytes = await readFile(join(b.build, 'splat.png')).catch(() => null);
  const splat = splatBytes ? decodePng(splatBytes) : null;
  if (!splat?.ok) return null;
  const means: number[][] = [];
  for (const name of MATERIAL_NAMES) {
    const bytes = await readFile(join(b.build, 'materials', name, 'albedo.png')).catch(() => null);
    const tile = bytes ? decodePng(bytes) : null;
    if (!tile?.ok) return null;
    const { data, channels, bitDepth } = tile.image;
    const max = bitDepth === 16 ? 65535 : 255;
    const sum = [0, 0, 0];
    const n = data.length / channels;
    for (let i = 0; i < n; i += 1) for (let c = 0; c < 3; c += 1) sum[c]! += data[i * channels + (channels >= 3 ? c : 0)]! / max;
    means.push(sum.map((s) => (s / n) * 255));
  }
  const { width, height, channels, data, bitDepth } = splat.image;
  const out = new Uint8Array(size * size * 4);
  const max = bitDepth === 16 ? 65535 : 255;
  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y * height) / size));
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x * width) / size));
      const from = (sy * width + sx) * channels;
      const w = [0, 1, 2, 3].map((k) => (channels > k ? data[from + k]! / max : 0));
      const total = w.reduce((a, c) => a + c, 0) || 1;
      for (let c = 0; c < 3; c += 1) out[(y * size + x) * 4 + c] = Math.round(w.reduce((a, wk, k) => a + (wk / total) * means[k]![c]!, 0));
      out[(y * size + x) * 4 + 3] = 255;
    }
  }
  return encodePngRgba8(out, size, size);
}

async function textureFor(b: Built, spec: TerrainSpec, mode: ExportOptions['texture']): Promise<string | undefined> {
  if (mode === 'none') return undefined;
  if (mode === 'drape') {
    const bytes = await readFile(join(b.build, 'drape.png')).catch(() => null);
    return bytes ? registerTexture(bytes) : undefined;
  }
  const size = Math.min(spec.textureSize, MAX_BAKE);
  const baked = await bakeSplat(b, size);
  return baked ? registerTexture(baked) : undefined;
}

/** Quantised heights: `round((h − min) / (max − min) × 65535)` over the spec's height range. */
export function quantiseHeights(heights: Float32Array, range: readonly [number, number]): Uint16Array {
  const span = range[1] - range[0] || 1;
  return Uint16Array.from(heights, (h) => Math.max(0, Math.min(65535, Math.round(((h - range[0]) / span) * 65535))));
}

function heightRangeOf(b: Built, spec: TerrainSpec): [number, number] {
  return [spec.heightRange[0], spec.heightRange[1]];
}

async function dirBytes(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const abs = join(path, entry.name);
    total += entry.isDirectory() ? await dirBytes(abs) : (await stat(abs)).size;
  }
  return total;
}

/** What to write and where; the target (`repoId`/`project`/`terrain`) is the caller's business. */
export type ExportOptions = Omit<TerrainExportOptions, 'repoId' | 'project' | 'terrain'>;
export type ExportTerrainArgs = { dir: string; spec: TerrainSpec; options: ExportOptions };

/** Writes the glb or the pack; answers where it went and how big it is. */
export async function exportTerrain({ dir, spec, options }: ExportTerrainArgs): Promise<GitOpResult<TerrainExportResult>> {
  try {
    const loaded = await loadBuilt(dir);
    if (!loaded.ok) return loaded;
    const b = loaded.value;
    const name = terrainSlug(spec.name) || 'terrain';
    const range = heightRangeOf(b, spec);
    const destExists = await has(options.dest);
    if (!destExists) await mkdir(options.dest, { recursive: true });

    if (options.format === 'glb') {
      const target = join(options.dest, `${name}.glb`);
      if (await has(target)) return failure(terrainExistsMessage(`${name}.glb`));
      const texture = await textureFor(b, spec, options.texture);
      const parts = chunkParts(b, range, options.lod, texture);
      if (options.roads) {
        const roads = mergedRoads(b);
        if (roads) parts.push(roads);
      }
      if (options.buildings) {
        const buildings = mergedBuildings(b);
        if (buildings) parts.push(buildings);
      }
      const glb = writeGlb(parts, name, null, options.foliage ? foliageInstancing(b).instancing : null);
      await writeFile(target, glb);
      return ok({ path: target, bytes: glb.length });
    }

    const folder = `${name}.terrain`;
    const target = join(options.dest, folder);
    if (await has(target)) return failure(terrainExistsMessage(folder));
    const tmp = join(options.dest, `.${folder}.tmp-${process.pid}-${Date.now()}`);
    await mkdir(join(tmp, 'chunks'), { recursive: true });
    try {
      await writePack(tmp, b, spec, name, range);
      await rename(tmp, target);
    } catch (error) {
      await rm(tmp, { recursive: true, force: true });
      throw error;
    }
    return ok({ path: target, bytes: await dirBytes(target) });
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

async function writePack(out: string, b: Built, spec: TerrainSpec, name: string, range: [number, number]): Promise<void> {
  const { field } = b;
  await writeFile(join(out, 'heightfield.png'), encodePngGrey16(quantiseHeights(field.heights, range), field.resolution, field.resolution));
  const hf: TerrainHeightfieldJson = { version: 1, resolution: field.resolution, worldSize: field.worldSize, heightRange: range, rowMajor: 'z', origin: 'centre' };
  await writeFile(join(out, 'heightfield.json'), JSON.stringify(hf, null, 2));

  const lods: TerrainManifest['chunks']['lods'] = [];
  for (let lod = 0; lod < TERRAIN_LOD_COUNT; lod += 1) {
    await writeFile(join(out, 'chunks', `lod${lod}.glb`), writeGlb(chunkParts(b, range, lod), `${name}-lod${lod}`));
    lods.push({ lod, glb: `chunks/lod${lod}.glb` });
  }

  const maps: TerrainManifest['maps'] = {};
  const copy = async (file: string, key?: keyof TerrainManifest['maps'], to = file): Promise<string | undefined> => {
    if (!(await has(join(b.build, file)))) return undefined;
    await mkdir(join(out, to, '..'), { recursive: true });
    await cp(join(b.build, file), join(out, to), { recursive: true });
    if (key) maps[key] = to;
    return to;
  };
  await mkdir(join(out, 'maps'), { recursive: true });
  await copy('drape.png', 'drape', 'maps/drape.png');
  await copy('splat.png', 'splat', 'maps/splat.png');
  await copy('landcover.png', 'landcover', 'maps/landcover.png');
  await copy('landcover.json', 'landcoverLegend', 'maps/landcover.json');

  let materials: TerrainManifest['materials'];
  if (await has(join(b.build, 'materials', 'grass', 'albedo.png'))) {
    await cp(join(b.build, 'materials'), join(out, 'materials'), { recursive: true });
    materials = Object.fromEntries(
      MATERIAL_NAMES.map((m) => [m, { albedo: `materials/${m}/albedo.png`, normal: `materials/${m}/normal.png` }]),
    ) as NonNullable<TerrainManifest['materials']>;
  }

  const foliage = await copy('foliage.json');
  const buildings = await copy('buildings.json');
  const roads = await copy('roads.json');

  const foliageAssets: NonNullable<TerrainManifest['foliageAssets']> = [];
  for (const asset of b.foliage?.assets ?? []) {
    const design = builtInFoliageDesign(asset);
    if (!design) continue;
    const g = foliageGeometry(design);
    await mkdir(join(out, 'foliage'), { recursive: true });
    const instancing: GltfInstancing = {
      meshes: [{ part: terrainMeshPart(asset, '#ffffff', g.positions, g.normals, g.indices), translations: new Float32Array(3), rotations: Float32Array.of(0, 0, 0, 1), scales: Float32Array.of(1, 1, 1), colors: g.colors }],
    };
    await writeFile(join(out, 'foliage', `${asset}.glb`), writeGlb([], asset, null, instancing));
    foliageAssets.push({ name: asset, glb: `foliage/${asset}.glb` });
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const h of field.heights) {
    if (h < minY) minY = h;
    if (h > maxY) maxY = h;
  }
  const half = field.worldSize / 2;
  const manifest: TerrainManifest = TerrainManifestSchema.parse({
    version: 1,
    name: spec.name,
    generator: 'midnite-studio',
    worldSize: field.worldSize,
    heightRange: range,
    bounds: { min: [-half, minY, -half], max: [half, maxY, half] },
    heightfield: { png: 'heightfield.png', json: 'heightfield.json' },
    chunks: { verts: b.verts, perSide: chunksPerSide(field.resolution), lods },
    maps,
    ...(materials ? { materials } : {}),
    ...(foliage ? { foliage } : {}),
    ...(buildings ? { buildings } : {}),
    ...(roads ? { roads } : {}),
    ...(foliageAssets.length > 0 ? { foliageAssets } : {}),
  });
  await writeFile(join(out, TERRAIN_MANIFEST_FILE), JSON.stringify(manifest, null, 2));
}
