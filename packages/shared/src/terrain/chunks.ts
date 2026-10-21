import { normalAt, type Heightfield } from './heightfield';

/**
 * Chunking and LOD. The grid is cut into square chunks that overlap by one vertex (so adjacent
 * chunks share their edge), each meshable at four levels of detail with a skirt to hide cracks.
 * Pure typed arrays; the renderer meshes on demand and Phase 107's kit reads the same rules.
 */
export const TERRAIN_LOD_COUNT = 4;

/** Vertices per chunk side: 65 up to a 1025 grid, 129 above it. */
export const chunkVerts = (resolution: number): number => (resolution <= 1025 ? 65 : 129);

export const chunksPerSide = (resolution: number): number => (resolution - 1) / (chunkVerts(resolution) - 1);

export type TerrainChunkInfo = {
  cx: number;
  cz: number;
  minY: number;
  maxY: number;
  /** World-space centre of the bounding sphere. */
  centre: [number, number, number];
  radius: number;
};

/** The skirt hangs this far below its edge, so mixed-LOD neighbours never show a gap. */
export const skirtDepth = (heightRange: readonly [number, number]): number => 0.02 * (heightRange[1] - heightRange[0]);

/** Distance bands, in chunk widths: LOD 0 below 1.5, 1 below 3, 2 below 6, else 3. */
export function selectLod(distance: number, chunkWorldSize: number): number {
  const widths = distance / chunkWorldSize;
  if (widths < 1.5) return 0;
  if (widths < 3) return 1;
  if (widths < 6) return 2;
  return 3;
}

/** A chunk's side in world metres. */
export const chunkWorldSize = (f: Pick<Heightfield, 'resolution' | 'worldSize'>): number =>
  ((chunkVerts(f.resolution) - 1) * f.worldSize) / (f.resolution - 1);

/** Per-chunk bounds, row-major by `cz` then `cx`. World coordinates are centred on the origin. */
export function chunkLayout(f: Heightfield): TerrainChunkInfo[] {
  const verts = chunkVerts(f.resolution);
  const per = chunksPerSide(f.resolution);
  const cell = f.worldSize / (f.resolution - 1);
  const half = f.worldSize / 2;
  const size = (verts - 1) * cell;
  const out: TerrainChunkInfo[] = [];
  for (let cz = 0; cz < per; cz += 1) {
    for (let cx = 0; cx < per; cx += 1) {
      let minY = Infinity;
      let maxY = -Infinity;
      const x0 = cx * (verts - 1);
      const z0 = cz * (verts - 1);
      for (let z = 0; z < verts; z += 1) {
        for (let x = 0; x < verts; x += 1) {
          const v = f.heights[(z0 + z) * f.resolution + x0 + x]!;
          if (v < minY) minY = v;
          if (v > maxY) maxY = v;
        }
      }
      const centre: [number, number, number] = [-half + x0 * cell + size / 2, (minY + maxY) / 2, -half + z0 * cell + size / 2];
      out.push({ cx, cz, minY, maxY, centre, radius: Math.hypot(size / 2, (maxY - minY) / 2, size / 2) });
    }
  }
  return out;
}

export type ChunkMesh = { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array };

/**
 * One chunk at one LOD, in world metres with the terrain centred on the origin and UVs spanning the
 * whole terrain in `[0, 1]`. The vertex step is `2^lod`, sampled straight from the heightfield, so a
 * coarser LOD's vertices are a subset of a finer one's and neighbours at different LODs agree on
 * every shared-edge vertex the coarser has. A skirt strip drops `skirtDepth` below each edge, wound
 * outward. Normals are the heightfield's full-resolution central differences, continuous across borders.
 */
export function chunkMesh(f: Heightfield, cx: number, cz: number, lod: number, heightRange: readonly [number, number] = [0, 100]): ChunkMesh {
  const verts = chunkVerts(f.resolution);
  const step = 2 ** lod;
  const n = (verts - 1) / step + 1;
  const cell = f.worldSize / (f.resolution - 1);
  const half = f.worldSize / 2;
  const x0 = cx * (verts - 1);
  const z0 = cz * (verts - 1);
  const res = f.resolution;
  const drop = skirtDepth(heightRange);

  const gridCount = n * n;
  const total = gridCount + n * 4;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);

  const put = (slot: number, gx: number, gz: number, yOffset: number) => {
    positions[slot * 3] = -half + gx * cell;
    positions[slot * 3 + 1] = f.heights[gz * res + gx]! + yOffset;
    positions[slot * 3 + 2] = -half + gz * cell;
    const nm = normalAt(f, gx, gz);
    normals[slot * 3] = nm[0];
    normals[slot * 3 + 1] = nm[1];
    normals[slot * 3 + 2] = nm[2];
    uvs[slot * 2] = gx / (res - 1);
    uvs[slot * 2 + 1] = gz / (res - 1);
  };

  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) put(j * n + i, x0 + i * step, z0 + j * step, 0);

  // Skirt rings, in the order north (z0), south, west (x0), east: slot `gridCount + edge * n + k`.
  const last = verts - 1;
  for (let k = 0; k < n; k += 1) {
    put(gridCount + k, x0 + k * step, z0, -drop);
    put(gridCount + n + k, x0 + k * step, z0 + last, -drop);
    put(gridCount + 2 * n + k, x0, z0 + k * step, -drop);
    put(gridCount + 3 * n + k, x0 + last, z0 + k * step, -drop);
  }

  const indices = new Uint32Array((n - 1) * (n - 1) * 6 + (n - 1) * 4 * 6);
  let o = 0;
  for (let j = 0; j < n - 1; j += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[o++] = a;
      indices[o++] = c;
      indices[o++] = b;
      indices[o++] = b;
      indices[o++] = c;
      indices[o++] = d;
    }
  }
  const strip = (gridAt: (k: number) => number, skirtBase: number, outwardIsReversed: boolean) => {
    for (let k = 0; k < n - 1; k += 1) {
      const a = gridAt(k);
      const b = gridAt(k + 1);
      const c = skirtBase + k;
      const d = skirtBase + k + 1;
      if (outwardIsReversed) {
        indices[o++] = a;
        indices[o++] = c;
        indices[o++] = b;
        indices[o++] = b;
        indices[o++] = c;
        indices[o++] = d;
      } else {
        indices[o++] = a;
        indices[o++] = b;
        indices[o++] = c;
        indices[o++] = b;
        indices[o++] = d;
        indices[o++] = c;
      }
    }
  };
  strip((k) => k, gridCount, false); // north: outward is -z
  strip((k) => (n - 1) * n + k, gridCount + n, true); // south: +z
  strip((k) => k * n, gridCount + 2 * n, true); // west: -x
  strip((k) => k * n + (n - 1), gridCount + 3 * n, false); // east: +x
  return { positions, normals, uvs, indices };
}
