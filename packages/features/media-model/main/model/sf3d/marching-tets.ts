/**
 * Marching tetrahedra over SF3D's tet grid (Phase 103 Theme J) — the TypeScript stand-in for the
 * Kaolin/`MarchingTetrahedraHelper` step SF3D runs in PyTorch.
 *
 * Inputs are the grid (`tets_vertices.bin`, xyz in [0, 1]; `tets_indices.bin`, 4 vertex ids per tet),
 * a signed field per grid vertex (positive = inside; SF3D's density minus its isosurface threshold)
 * and, optionally, the decoder's raw `vertex_offset`, which deforms the grid by
 * `tanh(offset) / resolution` before the surface is cut — SF3D's `normalize_grid_deformation`.
 *
 * Every crossing vertex is keyed by its grid edge, so triangles of neighbouring tets share vertices
 * and the surface comes out watertight. Each triangle is oriented so its normal points from the
 * tet's inside corners to its outside corners — the outward direction no matter which sign
 * convention a triangle table assumed.
 */

export type TetGrid = {
  /** xyz per grid vertex, in [0, 1]. */
  vertices: Float32Array;
  /** Four vertex ids per tet. */
  indices: Int32Array | Uint32Array;
};

export type TetMesh = {
  /** xyz per vertex, in grid space (deformation applied). */
  positions: Float32Array;
  /** Three vertex ids per triangle, counter-clockwise seen from outside. */
  indices: Uint32Array;
};

/** The six edges of a tet, as corner pairs — Kaolin's `base_tet_edges`. */
const TET_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

/**
 * Kaolin's triangle table: for each of the 16 inside/outside cases (bit i = corner i inside), up to
 * two triangles as indices into `TET_EDGES`. Orientation is fixed per triangle afterwards.
 */
const TRIANGLE_TABLE: readonly (readonly number[])[] = [
  [],
  [1, 0, 2],
  [4, 0, 3],
  [1, 4, 2, 1, 3, 4],
  [3, 1, 5],
  [2, 3, 0, 2, 5, 3],
  [1, 4, 0, 1, 5, 4],
  [4, 2, 5],
  [4, 5, 2],
  [4, 1, 0, 4, 5, 1],
  [3, 2, 0, 3, 5, 2],
  [1, 3, 5],
  [4, 1, 2, 4, 3, 1],
  [3, 0, 4],
  [2, 0, 1],
  [],
];

/** The grid vertices with SF3D's deformation applied: `v + tanh(offset) * (1 / resolution)`. */
export function deformGrid(vertices: Float32Array, offsets: Float32Array | null, resolution: number): Float32Array {
  if (!offsets) return vertices;
  if (offsets.length !== vertices.length) throw new Error(`vertex_offset has ${offsets.length} values for ${vertices.length / 3} vertices.`);
  const scale = 1 / resolution;
  const out = new Float32Array(vertices.length);
  for (let i = 0; i < vertices.length; i += 1) out[i] = vertices[i]! + Math.tanh(offsets[i]!) * scale;
  return out;
}

/**
 * Cuts the zero level of `field` out of the grid. `field.length` is the grid's vertex count;
 * `isCancelled` is polled every 64k tets so a cancel lands mid-surface.
 */
export function marchingTets(
  grid: TetGrid,
  field: Float32Array,
  options: { offsets?: Float32Array | null; resolution?: number; isCancelled?: () => boolean } = {},
): TetMesh {
  const vertexCount = grid.vertices.length / 3;
  if (field.length !== vertexCount) throw new Error(`The field has ${field.length} values for ${vertexCount} grid vertices.`);
  if (grid.indices.length % 4 !== 0) throw new Error('Tet indices must come in fours.');
  const verts = deformGrid(grid.vertices, options.offsets ?? null, options.resolution ?? 160);

  const edgeVertex = new Map<number, number>();
  const positions: number[] = [];
  const triangles: number[] = [];
  const corner = [0, 0, 0, 0];
  const edgeIds = [-1, -1, -1, -1, -1, -1];

  const crossing = (a: number, b: number): number => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const key = lo * vertexCount + hi;
    const seen = edgeVertex.get(key);
    if (seen !== undefined) return seen;
    const sa = field[lo]!;
    const sb = field[hi]!;
    const t = sa / (sa - sb);
    const id = positions.length / 3;
    for (let k = 0; k < 3; k += 1) {
      const pa = verts[lo * 3 + k]!;
      positions.push(pa + t * (verts[hi * 3 + k]! - pa));
    }
    edgeVertex.set(key, id);
    return id;
  };

  const tetCount = grid.indices.length / 4;
  for (let tet = 0; tet < tetCount; tet += 1) {
    if ((tet & 0xffff) === 0 && options.isCancelled?.()) throw new Error('cancelled');
    let code = 0;
    for (let c = 0; c < 4; c += 1) {
      const v = grid.indices[tet * 4 + c]!;
      corner[c] = v;
      if (field[v]! > 0) code |= 1 << c;
    }
    if (code === 0 || code === 15) continue;

    for (let e = 0; e < 6; e += 1) {
      const [a, b] = TET_EDGES[e]!;
      const ia = (code >> a) & 1;
      const ib = (code >> b) & 1;
      edgeIds[e] = ia !== ib ? crossing(corner[a]!, corner[b]!) : -1;
    }

    // Outward = from the inside corners' centroid towards the outside corners'.
    let ix = 0, iy = 0, iz = 0, ni = 0, ox = 0, oy = 0, oz = 0, no = 0;
    for (let c = 0; c < 4; c += 1) {
      const v = corner[c]!;
      if ((code >> c) & 1) {
        ix += verts[v * 3]!; iy += verts[v * 3 + 1]!; iz += verts[v * 3 + 2]!; ni += 1;
      } else {
        ox += verts[v * 3]!; oy += verts[v * 3 + 1]!; oz += verts[v * 3 + 2]!; no += 1;
      }
    }
    const dx = ox / no - ix / ni;
    const dy = oy / no - iy / ni;
    const dz = oz / no - iz / ni;

    const table = TRIANGLE_TABLE[code]!;
    for (let t = 0; t < table.length; t += 3) {
      const a = edgeIds[table[t]!]!;
      let b = edgeIds[table[t + 1]!]!;
      let c = edgeIds[table[t + 2]!]!;
      if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) continue;
      const ux = positions[b * 3]! - positions[a * 3]!;
      const uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
      const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
      const vx = positions[c * 3]! - positions[a * 3]!;
      const vy = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
      const vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (nx * dx + ny * dy + nz * dz < 0) [b, c] = [c, b];
      triangles.push(a, b, c);
    }
  }

  return { positions: Float32Array.from(positions), indices: Uint32Array.from(triangles) };
}

/**
 * A conforming tet grid over the unit cube — `n` cubes a side, six tets each, all sharing the cube's
 * main diagonal (the Freudenthal split), so faces between cubes match. What the tests march; SF3D's
 * own grid comes from `tets_*.bin`.
 */
export function cubeTetGrid(n: number): TetGrid {
  const side = n + 1;
  const vertices = new Float32Array(side * side * side * 3);
  const id = (x: number, y: number, z: number) => (z * side + y) * side + x;
  for (let z = 0; z < side; z += 1)
    for (let y = 0; y < side; y += 1)
      for (let x = 0; x < side; x += 1) {
        const i = id(x, y, z) * 3;
        vertices[i] = x / n;
        vertices[i + 1] = y / n;
        vertices[i + 2] = z / n;
      }
  // Six paths from corner 000 to 111 along the cube's edges, one tet each.
  const paths: [number, number, number][][] = [
    [[1, 0, 0], [1, 1, 0]],
    [[1, 0, 0], [1, 0, 1]],
    [[0, 1, 0], [1, 1, 0]],
    [[0, 1, 0], [0, 1, 1]],
    [[0, 0, 1], [1, 0, 1]],
    [[0, 0, 1], [0, 1, 1]],
  ].map((p) => p as [number, number, number][]);
  const indices = new Int32Array(n * n * n * 6 * 4);
  let k = 0;
  for (let z = 0; z < n; z += 1)
    for (let y = 0; y < n; y += 1)
      for (let x = 0; x < n; x += 1)
        for (const [p1, p2] of paths) {
          indices[k++] = id(x, y, z);
          indices[k++] = id(x + p1![0], y + p1![1], z + p1![2]);
          indices[k++] = id(x + p2![0], y + p2![1], z + p2![2]);
          indices[k++] = id(x + 1, y + 1, z + 1);
        }
  return { vertices, indices };
}
