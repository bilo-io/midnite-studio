import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildHeightfield,
  chunkLayout,
  classify,
  chunksPerSide,
  conformRoads,
  detectRoadColour,
  edgeWidth,
  extractFootprints,
  extractRoadMask,
  flattenFootprints,
  maskIoU,
  reseatFoliage,
  roadGraphFromMask,
  scatterFoliage,
  TERRAIN_CLASS_INDICES,
  builtInFoliageDesign,
  DEFAULT_FOLIAGE_ASSETS,
  toRoadsFile,
  chunkVerts,
  erode,
  fbmField,
  generateSplatMap,
  heightfieldStats,
  isNonSquare,
  NON_SQUARE_WARNING,
  ridgedField,
  TERRAIN_CLASSES,
  TERRAIN_CLASS_COLOURS,
  TERRAIN_LOD_COUNT,
  terrainToImageUv,
  toHeightSamples,
  type Heightfield,
  type RasterImage,
  type TerrainAlignment,
  type TerrainBuildStage,
  type TerrainBuildingsFile,
  type TerrainChunksFile,
  type TerrainClass,
  type TerrainFoliageFile,
  type TerrainSpec,
  type TerrainStats,
} from '@midnite/studio-shared';

import { decodePng, encodePngGrey8, encodePngRgba8 } from '../png/png-codec';
import { terrainMaterialsDir } from './materials-path';

/**
 * The terrain build, as a plain async function — the `terrain-worker` utility process runs it, and so
 * does vitest. Stages:
 * - `decode`: decode heightmap PNG
 * - `heightfield`: resample to 2^n+1, map to metres
 * - `erosion`: optional hydraulic erosion on noise terrains
 * - `drape`: resample satellite image into drape.png
 * - `landcover`: classify satellite drape into landcover.png + landcover.json
 * - `splat`: compute splat weights into splat.png and copy material tiles
 * - `roads`: key the roads mask, skeletonise it into a graph (roads-mask.png)
 * - `conform`: flatten the field along the roads, then write roads.json off the conformed ground
 * - `foliage`: Poisson-disk scatter on the tree / grass classes (foliage.json)
 * - `buildings`: footprints from the building class, flattened under (buildings.json)
 * - `write`: write heights.f32 and chunks.json
 */
export type BuildJob = { dir: string; outDir: string; spec: TerrainSpec };

/** The stages a spec has work for, in order. `write` always runs. */
export function plannedStages(spec: TerrainSpec): TerrainBuildStage[] {
  const stages: TerrainBuildStage[] = [];
  if (spec.inputs.heightmap) stages.push('decode');
  stages.push('heightfield');
  if (!spec.inputs.heightmap && spec.noise && spec.noise.erosion.iterations > 0) stages.push('erosion');
  if (spec.inputs.satellite) {
    stages.push('drape');
    stages.push('landcover');
    stages.push('splat');
  }
  if (spec.inputs.roads) {
    stages.push('roads');
    stages.push('conform');
  }
  if (spec.inputs.satellite) {
    stages.push('foliage');
    stages.push('buildings');
  }
  stages.push('write');
  return stages;
}

export class TerrainBuildError extends Error {}

export async function runTerrainBuild(
  job: BuildJob,
  onProgress: (stage: TerrainBuildStage, fraction: number) => void = () => undefined,
  now: () => number = Date.now,
): Promise<TerrainStats> {
  const started = now();
  const { spec } = job;
  const heightmap = spec.inputs.heightmap;
  if (!heightmap && !spec.noise) throw new TerrainBuildError('Nothing to shape the ground from — attach a heightmap or choose noise.');
  const warnings: string[] = [];
  let field: Heightfield;

  if (heightmap) {
    field = await heightfieldFromImage(job, heightmap.file, warnings, onProgress);
  } else {
    field = noiseHeightfield(spec, onProgress);
  }
  const out = join(job.dir, job.outDir);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  let classPercent: Record<TerrainClass, number> | undefined;
  /** The land cover, kept for the foliage and buildings stages. */
  let landcover: { classes: Uint8Array; res: number } | undefined;

  // Theme E & F: Satellite drape, land-cover classification and splat materials
  if (spec.inputs.satellite) {
    onProgress('drape', 0);
    const satPath = join(job.dir, spec.inputs.satellite.file);
    const satBytes = await readFile(satPath).catch(() => {
      throw new TerrainBuildError('The satellite image file is missing — attach it again.');
    });
    const satDecoded = decodePng(satBytes);
    if (!satDecoded.ok) throw new TerrainBuildError(satDecoded.message);

    const alignment: TerrainAlignment = spec.alignment.satellite ?? {
      offset: [0, 0],
      scale: [1, 1],
      rotationDeg: 0,
    };
    const drapeRes = spec.textureSize;
    const { rgba: drapeRgba, raster: drapeRaster } = resampleDrape(satDecoded.image, drapeRes, alignment);
    await writeFile(join(out, 'drape.png'), encodePngRgba8(drapeRgba, drapeRes, drapeRes));
    onProgress('drape', 1);

    onProgress('landcover', 0);
    // Downsample drape to 2048 if larger for classification
    const classifyRes = Math.min(drapeRes, 2048);
    const classifyRaster =
      classifyRes === drapeRes ? drapeRaster : downscaleRaster(drapeRaster, classifyRes);

    // Check for overrides layer
    let overrides: Uint8Array | undefined;
    const overridePath = join(job.dir, 'overrides', 'landcover.png');
    const overrideBytes = await readFile(overridePath).catch(() => null);
    if (overrideBytes) {
      const dec = decodePng(overrideBytes);
      if (dec.ok && dec.image.width === classifyRes && dec.image.height === classifyRes) {
        overrides = dec.image.data instanceof Uint8Array ? dec.image.data : new Uint8Array(dec.image.data.buffer);
      }
    }

    const { classes } = classify(classifyRaster, field, {
      k: spec.classes.k,
      exgThreshold: spec.classes.exgThreshold,
      rockSlopeDeg: spec.classes.rockSlopeDeg,
      seaLevel: spec.seaLevel,
      seed: spec.noise?.seed ?? 1,
      overrides,
    });

    await writeFile(join(out, 'landcover.png'), encodePngGrey8(classes, classifyRes, classifyRes));
    landcover = { classes, res: classifyRes };

    // Calculate class percentages
    const counts = new Uint32Array(TERRAIN_CLASSES.length);
    for (let i = 0; i < classes.length; i += 1) {
      const c = classes[i]!;
      if (c < TERRAIN_CLASSES.length) counts[c] = (counts[c] ?? 0) + 1;
    }
    classPercent = {} as Record<TerrainClass, number>;
    for (let i = 0; i < TERRAIN_CLASSES.length; i += 1) {
      const cName = TERRAIN_CLASSES[i]!;
      classPercent[cName] = Math.round((counts[i]! / classes.length) * 1000) / 10;
    }

    const landcoverLegend = {
      classes: TERRAIN_CLASSES,
      colours: TERRAIN_CLASS_COLOURS,
      percent: classPercent,
    };
    await writeFile(join(out, 'landcover.json'), JSON.stringify(landcoverLegend, null, 2));
    onProgress('landcover', 1);

    onProgress('splat', 0);
    const splatRgba = generateSplatMap(classes, classifyRes, field, drapeRes, {
      rockSlopeDeg: spec.classes.rockSlopeDeg,
      heightRange: spec.heightRange,
      snowLineM: spec.snowLineM,
    });
    await writeFile(join(out, 'splat.png'), encodePngRgba8(splatRgba, drapeRes, drapeRes));

    // Copy CC0 material tiles to out/materials/
    const materialsSrc = terrainMaterialsDir();
    const materialsDest = join(out, 'materials');
    await cp(materialsSrc, materialsDest, { recursive: true }).catch(() => undefined);
    onProgress('splat', 1);
  }

  // Theme H: roads, then the conform under them.
  let roadStats: Pick<TerrainStats, 'roadCount' | 'roadLengthM' | 'roadAgreement'> = {};
  /** The cleaned roads mask at the land cover's resolution, so foliage keeps off the roads too. */
  let roadsOnLandcover: Uint8Array | undefined;
  if (spec.inputs.roads) {
    onProgress('roads', 0);
    const bytes = await readFile(join(job.dir, spec.inputs.roads.file)).catch(() => {
      throw new TerrainBuildError('The roads mask file is missing — attach it again.');
    });
    const decoded = decodePng(bytes);
    if (!decoded.ok) throw new TerrainBuildError(decoded.message);
    const roadsAlignment = spec.alignment.roads === 'satellite' ? (spec.alignment.satellite ?? IDENTITY_ALIGNMENT) : spec.alignment.roads;
    const roadsRes = Math.min(spec.textureSize, 2048);
    const colour = spec.roads.colour ?? detectRoadColour(decoded.image).colour;
    const { raster } = resampleDrape(decoded.image, roadsRes, roadsAlignment);
    const { graph, mask, mPerPx } = roadGraphFromMask(extractRoadMask(raster, colour, spec.roads.tolerance), roadsRes, {
      worldSize: spec.worldSize,
      spurMinM: spec.roads.spurMinM,
      widthClampM: spec.roads.widthClampM,
    });
    const preview = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i += 1) preview[i] = mask[i] ? 255 : 0;
    await writeFile(join(out, 'roads-mask.png'), encodePngGrey8(preview, roadsRes, roadsRes));
    if (graph.edges.length === 0) warnings.push('No roads found in the roads mask — check the road colour and tolerance.');
    onProgress('roads', 1);

    onProgress('conform', 0);
    const widthOpts = { mPerPx, widthScale: spec.roads.widthScale, widthClampM: spec.roads.widthClampM };
    const conformed = conformRoads(
      field,
      graph.edges.map((e) => ({ id: e.id, path: e.path, widthM: edgeWidth(e, widthOpts) })),
      { blendM: spec.roads.blendM, maxCutFillM: spec.roads.maxCutFillM },
    );
    field = conformed.field;
    warnings.push(...conformed.warnings);
    const roadsFile = toRoadsFile(graph, field, widthOpts);
    await writeFile(join(out, 'roads.json'), JSON.stringify(roadsFile));
    roadStats = {
      roadCount: roadsFile.edges.length,
      roadLengthM: Math.round(roadsFile.edges.reduce((sum, e) => sum + e.lengthM, 0)),
    };
    if (landcover) {
      roadsOnLandcover = resampleMask(mask, roadsRes, landcover.res);
      const satelliteRoads = landcover.classes.map((c) => (c === TERRAIN_CLASS_INDICES.road ? 1 : 0));
      roadStats.roadAgreement = Math.round(maskIoU(satelliteRoads, roadsOnLandcover) * 1000) / 1000;
    }
    onProgress('conform', 1);
  }

  // Theme G: foliage and buildings, both read off the land cover.
  let foliageCount: number | undefined;
  let buildingCount: number | undefined;
  if (landcover) {
    onProgress('foliage', 0);
    const foliageOpts = { ...spec.foliage, assets: resolveFoliageAssets(spec.foliage.assets, warnings) };
    const scattered = scatterFoliage(landcover.classes, landcover.res, field, foliageOpts, roadsOnLandcover);
    warnings.push(...scattered.warnings);
    onProgress('foliage', 1);

    onProgress('buildings', 0);
    const footprints = extractFootprints(landcover.classes, landcover.res, spec.worldSize, field, spec.buildings);
    warnings.push(...footprints.warnings);
    // Buildings flatten after the roads, so a building never re-tilts a road.
    const flattened = flattenFootprints(field, footprints.buildings, spec.buildings.flattenBlendM);
    field = flattened.field;
    const buildingsFile: TerrainBuildingsFile = { version: 1, buildings: flattened.buildings };
    await writeFile(join(out, 'buildings.json'), JSON.stringify(buildingsFile));
    // The flatten moved ground near the footprints: sit every plant back on it.
    const foliageFile: TerrainFoliageFile = { version: 1, assets: scattered.assets, instances: roundInstances(reseatFoliage(scattered.instances, field)) };
    await writeFile(join(out, 'foliage.json'), JSON.stringify(foliageFile));
    foliageCount = foliageFile.instances.length;
    buildingCount = buildingsFile.buildings.length;
    onProgress('buildings', 1);
  }

  const stats = heightfieldStats(field);
  onProgress('write', 0);
  await writeFile(join(out, 'heights.f32'), Buffer.from(field.heights.buffer, field.heights.byteOffset, field.heights.byteLength));
  const chunks = chunkLayout(field);
  const chunksFile: TerrainChunksFile = {
    resolution: spec.resolution,
    worldSize: spec.worldSize,
    heightRange: [spec.heightRange[0], spec.heightRange[1]],
    chunkVerts: chunkVerts(spec.resolution),
    chunksPerSide: chunksPerSide(spec.resolution),
    lodCount: TERRAIN_LOD_COUNT,
    chunks,
  };
  await writeFile(join(out, 'chunks.json'), JSON.stringify(chunksFile));
  onProgress('write', 1);

  return {
    resolution: spec.resolution,
    worldSize: spec.worldSize,
    vertexCount: spec.resolution * spec.resolution,
    triangleCount: (spec.resolution - 1) * (spec.resolution - 1) * 2,
    chunkCount: chunks.length,
    lodCount: TERRAIN_LOD_COUNT,
    buildMs: Math.max(0, Math.round(now() - started)),
    minHeight: stats.min,
    maxHeight: stats.max,
    histogram: stats.histogram,
    classPercent,
    ...roadStats,
    buildingCount,
    foliageCount,
    warnings,
  };
}

const IDENTITY_ALIGNMENT: TerrainAlignment = { offset: [0, 0], scale: [1, 1], rotationDeg: 0 };

/**
 * Built-in designs pass; anything else (a Models library path) is not loadable by the build yet,
 * so it falls back to the class's built-in defaults with a warning.
 */
function resolveFoliageAssets(
  assets: TerrainSpec['foliage']['assets'],
  warnings: string[],
): Record<'tree' | 'grass', string[]> {
  const resolved = { ...DEFAULT_FOLIAGE_ASSETS };
  for (const cls of ['tree', 'grass'] as const) {
    const wanted = assets?.[cls];
    if (!wanted || wanted.length === 0) continue;
    const known = wanted.filter((id) => builtInFoliageDesign(id));
    for (const id of wanted) if (!builtInFoliageDesign(id)) warnings.push(`Foliage asset "${id}" is not available; using the built-in ${cls} designs.`);
    resolved[cls] = known.length > 0 ? known : DEFAULT_FOLIAGE_ASSETS[cls];
  }
  return resolved;
}

/** Centimetre positions and milliradian yaw keep 200 000 instances compact on disk. */
function roundInstances(instances: TerrainFoliageFile['instances']): TerrainFoliageFile['instances'] {
  const r = (v: number, k: number): number => Math.round(v * k) / k;
  return instances.map(([a, x, y, z, yaw, scale]) => [a, r(x, 100), r(y, 100), r(z, 100), r(yaw, 1000), r(scale, 1000)]);
}

/** Nearest-neighbour resize of a square binary mask. */
function resampleMask(mask: Uint8Array, from: number, to: number): Uint8Array {
  if (from === to) return mask;
  const out = new Uint8Array(to * to);
  for (let y = 0; y < to; y += 1) {
    const sy = Math.min(from - 1, Math.floor(((y + 0.5) * from) / to));
    for (let x = 0; x < to; x += 1) out[y * to + x] = mask[sy * from + Math.min(from - 1, Math.floor(((x + 0.5) * from) / to))]!;
  }
  return out;
}

async function heightfieldFromImage(
  job: BuildJob,
  file: string,
  warnings: string[],
  onProgress: (stage: TerrainBuildStage, fraction: number) => void,
): Promise<Heightfield> {
  const { spec } = job;
  onProgress('decode', 0);
  const bytes = await readFile(join(job.dir, file)).catch(() => {
    throw new TerrainBuildError('The heightmap file is missing — attach it again.');
  });
  const decoded = decodePng(bytes);
  if (!decoded.ok) throw new TerrainBuildError(decoded.message);
  const { image } = decoded;
  const height = toHeightSamples(image);
  warnings.push(...height.warnings);
  if (isNonSquare(image.width, image.height)) warnings.push(NON_SQUARE_WARNING);
  onProgress('decode', 1);

  onProgress('heightfield', 0);
  const field = buildHeightfield(height.samples, image.width, image.height, {
    resolution: spec.resolution,
    worldSize: spec.worldSize,
    heightRange: spec.heightRange,
    preSmooth: spec.preSmooth,
  });
  onProgress('heightfield', 1);
  return field;
}

/** No heightmap: fBm or ridged noise from the spec's seed, optionally eroded, mapped onto the height range. */
function noiseHeightfield(spec: TerrainSpec, onProgress: (stage: TerrainBuildStage, fraction: number) => void): Heightfield {
  const noise = spec.noise!;
  onProgress('heightfield', 0);
  const params = { seed: noise.seed, octaves: noise.octaves, frequency: noise.frequency, persistence: noise.persistence, lacunarity: noise.lacunarity, island: noise.island };
  let grid = noise.kind === 'ridged' ? ridgedField(spec.resolution, params) : fbmField(spec.resolution, params);
  onProgress('heightfield', 1);
  if (noise.erosion.iterations > 0) {
    onProgress('erosion', 0);
    grid = erode(grid, spec.resolution, { iterations: noise.erosion.iterations, seed: noise.seed }, (f) => onProgress('erosion', f)).heights;
    // Erosion moves mass around, so stretch the result back over the full range.
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < grid.length; i += 1) {
      min = Math.min(min, grid[i]!);
      max = Math.max(max, grid[i]!);
    }
    const span = max - min;
    if (span > 0) for (let i = 0; i < grid.length; i += 1) grid[i] = (grid[i]! - min) / span;
  }
  const [lo, hi] = spec.heightRange;
  const heights = new Float32Array(grid.length);
  for (let i = 0; i < grid.length; i += 1) heights[i] = lo + Math.min(1, Math.max(0, grid[i]!)) * (hi - lo);
  return { resolution: spec.resolution, worldSize: spec.worldSize, heights };
}

/** Resamples a satellite image into the terrain drape texture via bilinear interpolation. */
function resampleDrape(
  satImage: RasterImage,
  outSize: number,
  alignment: TerrainAlignment,
): { rgba: Uint8Array; raster: RasterImage } {
  const outRgba = new Uint8Array(outSize * outSize * 4);
  const srcW = satImage.width;
  const srcH = satImage.height;
  const srcCh = satImage.channels;
  const srcData = satImage.data instanceof Uint8Array ? satImage.data : new Uint8Array(satImage.data.buffer);

  for (let y = 0; y < outSize; y += 1) {
    const v = (y + 0.5) / outSize;
    for (let x = 0; x < outSize; x += 1) {
      const u = (x + 0.5) / outSize;
      const [imgU, imgV] = terrainToImageUv(u, v, alignment);

      const outIdx = (y * outSize + x) * 4;
      if (imgU < 0 || imgU > 1 || imgV < 0 || imgV > 1) {
        outRgba[outIdx] = 0;
        outRgba[outIdx + 1] = 0;
        outRgba[outIdx + 2] = 0;
        outRgba[outIdx + 3] = 0;
        continue;
      }

      const px = imgU * (srcW - 1);
      const py = imgV * (srcH - 1);
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const y1 = Math.min(srcH - 1, y0 + 1);
      const tx = px - x0;
      const ty = py - y0;

      const idx00 = (y0 * srcW + x0) * srcCh;
      const idx10 = (y0 * srcW + x1) * srcCh;
      const idx01 = (y1 * srcW + x0) * srcCh;
      const idx11 = (y1 * srcW + x1) * srcCh;

      const bilerp = (offset: number) => {
        const v00 = srcData[idx00 + offset]!;
        const v10 = srcData[idx10 + offset]!;
        const v01 = srcData[idx01 + offset]!;
        const v11 = srcData[idx11 + offset]!;
        return Math.round((1 - ty) * ((1 - tx) * v00 + tx * v10) + ty * ((1 - tx) * v01 + tx * v11));
      };

      const r = bilerp(0);
      const g = srcCh >= 2 ? bilerp(1) : r;
      const b = srcCh >= 3 ? bilerp(2) : r;
      const a = srcCh >= 4 ? bilerp(3) : 255;

      outRgba[outIdx] = r;
      outRgba[outIdx + 1] = g;
      outRgba[outIdx + 2] = b;
      outRgba[outIdx + 3] = a;
    }
  }

  return {
    rgba: outRgba,
    raster: {
      width: outSize,
      height: outSize,
      channels: 4,
      bitDepth: 8,
      data: outRgba,
    },
  };
}

/** Downsamples an RGBA raster image by box averaging to targetSize x targetSize. */
function downscaleRaster(src: RasterImage, targetSize: number): RasterImage {
  const data = src.data instanceof Uint8Array ? src.data : new Uint8Array(src.data.buffer);
  const out = new Uint8Array(targetSize * targetSize * 4);
  const scale = src.width / targetSize;

  for (let y = 0; y < targetSize; y += 1) {
    const srcY = Math.min(src.height - 1, Math.floor(y * scale));
    for (let x = 0; x < targetSize; x += 1) {
      const srcX = Math.min(src.width - 1, Math.floor(x * scale));
      const srcIdx = (srcY * src.width + srcX) * 4;
      const outIdx = (y * targetSize + x) * 4;
      out[outIdx] = data[srcIdx]!;
      out[outIdx + 1] = data[srcIdx + 1]!;
      out[outIdx + 2] = data[srcIdx + 2]!;
      out[outIdx + 3] = data[srcIdx + 3]!;
    }
  }

  return {
    width: targetSize,
    height: targetSize,
    channels: 4,
    bitDepth: 8,
    data: out,
  };
}
