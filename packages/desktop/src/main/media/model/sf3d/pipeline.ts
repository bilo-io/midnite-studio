import type { Sf3dGenerateStage } from '@midnite/studio-shared';

import { atlasLayout, bakeTexture, buildAtlas } from './atlas';
import { writeTexturedGlb } from './glb-textured';
import { marchingTets, type TetGrid } from './marching-tets';
import { encodePng } from './png';
import { sf3dCameraToWorld, sf3dIntrinsicNormed } from './prepare-image';
import { createColorSampler, SF3D_RADIUS, type ColorMlp } from './triplane';

/**
 * SF3D image → textured `.glb`, end to end, with the three ONNX graphs behind a seam (Phase 103 Theme J).
 *
 *   rgb ─ image tokenizer ─▶ tokens ─ backbone ─▶ triplane ─ decoder(grid points) ─▶ density, offsets
 *       ─ marching tets ─▶ surface ─ atlas + colour MLP bake ─▶ texture ─▶ .glb
 *
 * `Sf3dInference` is what `sf3d-worker` implements on `onnxruntime-node`; the tests implement it with
 * an analytic field so the whole post-processing chain runs without the 1.7 GB of weights.
 */
export type Sf3dInference = {
  /** `rgb` `[1,512,512,3]`, `c2w` `[1,4,4]`, `intrinsic_normed` `[1,3,3]` → image tokens. */
  tokenize: (input: { rgb: Float32Array; c2w: Float32Array; intrinsicNormed: Float32Array }) => Promise<Float32Array>;
  /** Image tokens → the `[1, 3, C, R, R]` triplane. */
  backbone: (tokens: Float32Array) => Promise<Float32Array>;
  /** World points (`N × 3`, SF3D space) → density `N` and raw vertex offsets `N × 3`. */
  decode: (triplane: Float32Array, positions: Float32Array) => Promise<{ density: Float32Array; offset: Float32Array }>;
};

export type Sf3dAssets = { grid: TetGrid; mlp: ColorMlp };

export type Sf3dPipelineOptions = {
  textureSize: number;
  /** SF3D's `isosurface_threshold` on the decoder's density. */
  threshold?: number;
  /** SF3D's `isosurface_resolution` (the deformation scale). */
  resolution?: number;
  /** Grid points per decoder call. */
  decodeBatch?: number;
  triplaneChannels?: number;
  name?: string;
  onStage?: (stage: Sf3dGenerateStage, fraction?: number) => void;
  isCancelled?: () => boolean;
};

export type Sf3dPipelineResult = {
  glb: Buffer;
  vertices: number;
  triangles: number;
  /** glTF-space bounds of the surface. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  textureSize: number;
};

export const SF3D_DEFAULTS = { threshold: 10, resolution: 160, decodeBatch: 131_072, triplaneChannels: 40, roughness: 0.6, metalness: 0 };

/** SF3D's Z-up model space → glTF's Y-up: `run.py` rotates −90° about X, then 90° about Y. */
export function sf3dToGltf(x: number, y: number, z: number): [number, number, number] {
  return [-y, z, -x];
}

const checkCancel = (options: Sf3dPipelineOptions) => {
  if (options.isCancelled?.()) throw new Error('cancelled');
};

/** The smallest texture at or above `requested` whose atlas fits `triangles` (up to 4096). */
export function fitTextureSize(triangles: number, requested: number): number {
  for (let size = requested; size <= 4096; size *= 2) {
    try {
      atlasLayout(triangles, size);
      return size;
    } catch {
      // too small; try the next power of two
    }
  }
  throw new Error(`The surface has ${triangles} triangles — too many to texture. Try a simpler picture.`);
}

export async function runSf3dPipeline(
  inference: Sf3dInference,
  assets: Sf3dAssets,
  rgb: Float32Array,
  options: Sf3dPipelineOptions,
): Promise<Sf3dPipelineResult> {
  const threshold = options.threshold ?? SF3D_DEFAULTS.threshold;
  const resolution = options.resolution ?? SF3D_DEFAULTS.resolution;
  const batch = options.decodeBatch ?? SF3D_DEFAULTS.decodeBatch;
  const channels = options.triplaneChannels ?? SF3D_DEFAULTS.triplaneChannels;
  const stage = options.onStage ?? (() => undefined);

  stage('tokenizing');
  const tokens = await inference.tokenize({ rgb, c2w: sf3dCameraToWorld(), intrinsicNormed: sf3dIntrinsicNormed() });
  checkCancel(options);

  stage('backbone');
  const triplane = await inference.backbone(tokens);
  checkCancel(options);
  const planeTexels = triplane.length / (3 * channels);
  const planeRes = Math.round(Math.sqrt(planeTexels));
  if (planeRes * planeRes * 3 * channels !== triplane.length) throw new Error(`The backbone returned ${triplane.length} values, not a 3×${channels}×R×R triplane.`);

  stage('decoding', 0);
  const grid = assets.grid;
  const count = grid.vertices.length / 3;
  const world = new Float32Array(grid.vertices.length);
  for (let i = 0; i < world.length; i += 1) world[i] = grid.vertices[i]! * 2 * SF3D_RADIUS - SF3D_RADIUS;
  const field = new Float32Array(count);
  const offsets = new Float32Array(count * 3);
  for (let start = 0; start < count; start += batch) {
    const end = Math.min(count, start + batch);
    const out = await inference.decode(triplane, world.subarray(start * 3, end * 3));
    if (out.density.length !== end - start || out.offset.length !== (end - start) * 3) throw new Error('The decoder returned the wrong number of values.');
    for (let i = start; i < end; i += 1) field[i] = out.density[i - start]! - threshold;
    offsets.set(out.offset, start * 3);
    checkCancel(options);
    stage('decoding', end / count);
  }

  stage('meshing');
  const surface = marchingTets(grid, field, { offsets, resolution, isCancelled: options.isCancelled });
  const triangles = surface.indices.length / 3;
  if (triangles === 0) throw new Error('SF3D found no surface in this picture. Try a cut-out (transparent background) picture of a single object.');
  // Grid space [0, 1] → SF3D world space.
  const positions = surface.positions;
  for (let i = 0; i < positions.length; i += 1) positions[i] = positions[i]! * 2 * SF3D_RADIUS - SF3D_RADIUS;

  stage('texturing', 0);
  const textureSize = fitTextureSize(triangles, options.textureSize);
  const atlas = buildAtlas(triangles, textureSize);
  const colorAt = createColorSampler({ data: triplane, channels, resolution: planeRes }, assets.mlp);
  const rgba = bakeTexture(atlas, positions, surface.indices, colorAt, {
    isCancelled: options.isCancelled,
    onProgress: (fraction) => stage('texturing', fraction),
  });
  checkCancel(options);

  const gltf = new Float32Array(positions.length);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    const p = sf3dToGltf(positions[i]!, positions[i + 1]!, positions[i + 2]!);
    for (let k = 0; k < 3; k += 1) {
      gltf[i + k] = p[k]!;
      if (p[k]! < min[k]!) min[k] = p[k]!;
      if (p[k]! > max[k]!) max[k] = p[k]!;
    }
  }
  const glb = writeTexturedGlb({
    positions: gltf,
    indices: surface.indices,
    uvs: atlas.uvs,
    png: encodePng(rgba, textureSize, textureSize),
    name: options.name ?? 'sf3d',
    roughness: SF3D_DEFAULTS.roughness,
    metalness: SF3D_DEFAULTS.metalness,
  });
  return { glb, vertices: positions.length / 3, triangles, bounds: { min, max }, textureSize };
}
