/** The relief as three geometry: ground tiles that follow it, the fine patch over the work, and building volumes. */
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, ShapeUtils, Vector2 } from 'three';

import type { GameLevelTerrainDetail } from '@midnite/studio-shared';
import type { GroundTile } from './level-cull';
import { buildingWalls, tileLines } from './level-relief';

type HeightAt = (x: number, z: number) => number;
/** An area some other mesh covers: ground vertices strictly inside it sink to `floor`. */
export type Hole = GroundTile & { floor: number };

/**
 * A grid of vertices over `area` on the given X and Z lines, each at `heightAt` (plus `lift`), its UVs a window onto
 * `uvOver` (an image spanning it, north up). With a `hole`, vertices strictly inside it sit at `hole.floor` instead:
 * the quads round its edge become a skirt under whatever mesh covers the hole (several holes may be given).
 */
export function groundGeometry(xs: readonly number[], zs: readonly number[], heightAt: HeightAt, uvOver: GroundTile, lift = 0, hole: Hole | readonly Hole[] | null = null): BufferGeometry {
  const holes: readonly Hole[] = hole === null ? [] : Array.isArray(hole) ? (hole as readonly Hole[]) : [hole as Hole];
  const cols = xs.length, rows = zs.length;
  const pos = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2);
  const W = uvOver.maxX - uvOver.minX || 1, H = uvOver.maxZ - uvOver.minZ || 1;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = xs[i]!, z = zs[j]!, k = j * cols + i;
      const sunk = holes.find((h) => x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ);
      pos[k * 3] = x;
      pos[k * 3 + 1] = sunk ? sunk.floor : heightAt(x, z) + lift;
      pos[k * 3 + 2] = z;
      uv[k * 2] = (x - uvOver.minX) / W;
      uv[k * 2 + 1] = 1 - (z - uvOver.minZ) / H;
    }
  }
  const index: number[] = [];
  for (let j = 0; j + 1 < rows; j += 1) {
    for (let i = 0; i + 1 < cols; i += 1) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

const even = (min: number, max: number, n: number): number[] => Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1));

/** One ground tile of `segments`² quads (more where `hole`'s edges cross it), following the ground. */
export function tileGeometry(tile: GroundTile, all: GroundTile, heightAt: HeightAt, segments: number, hole: Hole | readonly Hole[] | null = null): BufferGeometry {
  const holes: readonly Hole[] = hole === null ? [] : Array.isArray(hole) ? (hole as readonly Hole[]) : [hole as Hole];
  const xs = tileLines(tile.minX, tile.maxX, segments, holes.flatMap((h) => [h.minX, h.maxX]));
  const zs = tileLines(tile.minZ, tile.maxZ, segments, holes.flatMap((h) => [h.minZ, h.maxZ]));
  return groundGeometry(xs, zs, heightAt, all, 0, holes);
}

/** The fine patch over `area` (the terrain detail's extent, which its drape crop spans): `cols × rows` vertices, `lift` above the ground. */
export function patchGeometry(area: GroundTile, cols: number, rows: number, heightAt: HeightAt, lift: number): BufferGeometry {
  return groundGeometry(even(area.minX, area.maxX, cols), even(area.minZ, area.maxZ, rows), heightAt, area, lift);
}

/**
 * A terrain detail's buildings as one mesh and one set of edges. Each stands from the lowest ground under its
 * footprint to its stated top (`baseY + height`), so none floats on a slope; `null` when the pack stated no heights.
 */
export function buildingsGeometry(detail: Pick<GameLevelTerrainDetail, 'buildings' | 'buildingHeights'>, heightAt: HeightAt | null, ground: number): { mesh: BufferGeometry; edges: BufferGeometry } | null {
  const stated = detail.buildingHeights;
  if (!stated || stated.length < detail.buildings.length * 2 || detail.buildings.length === 0) return null;
  const triangles: number[] = [], edges: number[] = [];
  detail.buildings.forEach((footprint, b) => {
    const n = Math.floor(footprint.length / 2);
    const height = stated[b * 2 + 1]!;
    let base = ground, top = ground + height;
    if (heightAt) {
      base = Infinity;
      for (let i = 0; i < n; i += 1) base = Math.min(base, heightAt(footprint[i * 2]!, footprint[i * 2 + 1]!));
      top = Math.max(stated[b * 2]! + height, base + Math.min(height, 3));
    }
    buildingWalls(footprint, base, top, triangles, edges);
    const ring: Vector2[] = [];
    for (let i = 0; i < n; i += 1) ring.push(new Vector2(footprint[i * 2]!, footprint[i * 2 + 1]!));
    if (ring.length > 3 && ring[0]!.equals(ring[ring.length - 1]!)) ring.pop();
    for (const [a, c, d] of ShapeUtils.triangulateShape(ring, [])) {
      const A = ring[a!]!, C = ring[c!]!, D = ring[d!]!;
      triangles.push(A.x, top, A.y, C.x, top, C.y, D.x, top, D.y);
    }
  });
  const mesh = new BufferGeometry();
  mesh.setAttribute('position', new Float32BufferAttribute(triangles, 3));
  mesh.computeVertexNormals();
  const lines = new BufferGeometry();
  lines.setAttribute('position', new Float32BufferAttribute(edges, 3));
  return { mesh, edges: lines };
}

/** Line segments as an object the scene can show, hide and dispose like a `GridHelper`. */
export function lineObject(positions: Float32Array, colour: string): LineSegments {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new LineSegments(g, new LineBasicMaterial({ color: colour }));
}
