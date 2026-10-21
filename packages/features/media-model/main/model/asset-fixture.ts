import { buildScene, type ModelPartInput, ModelSpecSchema } from '@midnite/studio-shared';

import { writeTexturedGlb } from './sf3d/glb-textured';
import { encodePng } from './sf3d/png';

/**
 * Test-only: a synthetic SF3D-style result — one textured `.glb` holding a whole standing figure as a
 * single mesh, the shape SF3D hands back (non-indexed triangles, a baked PNG atlas, Y up). No neural
 * output is involved: the body is the kernel's own ellipsoids merged into one surface, legs apart and
 * arms held a little away from the torso, with a planar uv projection over an 8×8 checker texture.
 */
const blob = (name: string, radii: [number, number, number], position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): ModelPartInput => ({
  name,
  shape: 'ellipsoid',
  radii,
  position,
  rotation,
  segments: 32,
});

/** About 1.8 tall, standing on y = 0, facing +Z. */
export const FIGURE_PARTS: ModelPartInput[] = [
  blob('left leg', [0.08, 0.42, 0.09], [0.12, 0.42, 0]),
  blob('right leg', [0.08, 0.42, 0.09], [-0.12, 0.42, 0]),
  blob('left foot', [0.06, 0.04, 0.12], [0.12, 0.04, 0.05]),
  blob('right foot', [0.06, 0.04, 0.12], [-0.12, 0.04, 0.05]),
  blob('hips', [0.19, 0.12, 0.12], [0, 0.86, 0]),
  blob('torso', [0.2, 0.36, 0.13], [0, 1.12, 0]),
  blob('neck', [0.05, 0.06, 0.05], [0, 1.5, 0]),
  blob('head', [0.11, 0.13, 0.12], [0, 1.66, 0]),
  blob('left arm', [0.05, 0.34, 0.05], [0.37, 1.12, 0], [0, 0, 20]),
  blob('right arm', [0.05, 0.34, 0.05], [-0.37, 1.12, 0], [0, 0, -20]),
];

/** An 8×8 RGBA checker, orange and teal. */
export function checkerPng(): Buffer {
  const size = 8;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const on = (x + y) % 2 === 0;
      rgba.set(on ? [240, 140, 40, 255] : [30, 150, 160, 255], (y * size + x) * 4);
    }
  }
  return encodePng(rgba, size, size);
}

/** The figure as one welded-per-part mesh, centred on x/z and lifted `offsetY` (SF3D results sit around the origin). */
export function figureMesh(offsetY = -0.9): { positions: Float32Array; indices: Uint32Array } {
  const parts = buildScene(ModelSpecSchema.parse({ name: 'figure', parts: FIGURE_PARTS }));
  const positions: number[] = [];
  const indices: number[] = [];
  for (const part of parts) {
    const base = positions.length / 3;
    for (let i = 0; i < part.positions.length; i += 3) positions.push(part.positions[i]!, part.positions[i + 1]! + offsetY, part.positions[i + 2]!);
    for (const index of part.indices) indices.push(base + index);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** The textured `.glb` of the figure, as SF3D would write it. */
export function figureGlb(): { glb: Buffer; png: Buffer; triangles: number } {
  const { positions, indices } = figureMesh();
  const uvs = new Float32Array(indices.length * 2);
  for (let i = 0; i < indices.length; i += 1) {
    const v = indices[i]! * 3;
    uvs[i * 2] = (positions[v]! + 0.6) / 1.2;
    uvs[i * 2 + 1] = 1 - (positions[v + 1]! + 0.9) / 1.8;
  }
  const png = checkerPng();
  const glb = writeTexturedGlb({ positions, indices, uvs, png, name: 'figure', roughness: 0.6, metalness: 0 });
  return { glb, png, triangles: indices.length / 3 };
}
