/**
 * Naive surface nets over a scalar field on a regular grid (Phase 104 Theme B; Theme C's SDF bake
 * reuses it).
 *
 * One vertex per grid cell the surface passes through, placed at the mean of that cell's edge
 * crossings; one quad per grid edge whose ends differ in sign, joining the four cells around it. Every
 * quad edge is shared by the quads around the neighbouring edge, so a field that is outside all along
 * the grid's border yields a closed mesh. Quads are split along their shorter diagonal. Triangles
 * wind counter-clockwise seen from outside, where outside is the positive side of the field.
 */

export type FieldGrid = {
  /** Node counts along x, y, z. */
  dims: readonly [number, number, number];
  /** World position of node (0,0,0). */
  origin: readonly [number, number, number];
  /** Node spacing (isotropic). */
  voxel: number;
  /** Signed field, x fastest: `values[i + nx * (j + ny * k)]`; negative inside. */
  values: Float32Array;
};

export type SurfaceNetsResult = {
  positions: Float32Array;
  indices: Uint32Array;
  /** For each output vertex, the grid node nearest the surface among its cell's corners (to look up per-node data). */
  anchors: Uint32Array;
};

const CORNERS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
/** The 12 cell edges as corner index pairs. */
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
];

export function surfaceNets(grid: FieldGrid): SurfaceNetsResult {
  const [nx, ny, nz] = grid.dims;
  const { values, voxel, origin } = grid;
  const node = (i: number, j: number, k: number): number => i + nx * (j + ny * k);
  const cellId = new Int32Array(Math.max(0, (nx - 1) * (ny - 1) * (nz - 1))).fill(-1);
  const cell = (i: number, j: number, k: number): number => i + (nx - 1) * (j + (ny - 1) * k);

  const positions: number[] = [];
  const anchors: number[] = [];
  const cornerValue = new Float64Array(8);
  const cornerNode = new Uint32Array(8);

  for (let k = 0; k < nz - 1; k += 1) {
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        let inside = 0;
        for (let c = 0; c < 8; c += 1) {
          const [dx, dy, dz] = CORNERS[c]!;
          const n = node(i + dx, j + dy, k + dz);
          cornerNode[c] = n;
          cornerValue[c] = values[n]!;
          if (cornerValue[c]! < 0) inside += 1;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let crossings = 0;
        for (const [a, b] of EDGES) {
          const va = cornerValue[a]!;
          const vb = cornerValue[b]!;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const [ax, ay, az] = CORNERS[a]!;
          const [bx, by, bz] = CORNERS[b]!;
          sx += ax + (bx - ax) * t;
          sy += ay + (by - ay) * t;
          sz += az + (bz - az) * t;
          crossings += 1;
        }
        let nearest = 0;
        for (let c = 1; c < 8; c += 1) if (Math.abs(cornerValue[c]!) < Math.abs(cornerValue[nearest]!)) nearest = c;
        cellId[cell(i, j, k)] = positions.length / 3;
        positions.push(origin[0] + (i + sx / crossings) * voxel, origin[1] + (j + sy / crossings) * voxel, origin[2] + (k + sz / crossings) * voxel);
        anchors.push(cornerNode[nearest]!);
      }
    }
  }

  const indices: number[] = [];
  const dist2 = (a: number, b: number): number => {
    const dx = positions[a * 3]! - positions[b * 3]!;
    const dy = positions[a * 3 + 1]! - positions[b * 3 + 1]!;
    const dz = positions[a * 3 + 2]! - positions[b * 3 + 2]!;
    return dx * dx + dy * dy + dz * dz;
  };
  const quad = (q0: number, q1: number, q2: number, q3: number, flip: boolean): void => {
    if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) return;
    const [a, b, c, d] = flip ? [q0, q3, q2, q1] : [q0, q1, q2, q3];
    if (dist2(a, c) <= dist2(b, d)) indices.push(a, b, c, a, c, d);
    else indices.push(a, b, d, b, c, d);
  };

  // For each axis, every node edge along it that changes sign owns one quad of the four cells around it.
  // (a, u, w) is a cyclic permutation of (x, y, z), so u × w = a and the order below faces +a.
  for (let k = 1; k < nz - 1; k += 1) {
    for (let j = 1; j < ny - 1; j += 1) {
      for (let i = 1; i < nx - 1; i += 1) {
        const here = values[node(i, j, k)]! < 0;
        // x edge (i,j,k)-(i+1,j,k): cells (i, j-1|j, k-1|k)
        if (i < nx - 1 && here !== values[node(i + 1, j, k)]! < 0) {
          quad(cellId[cell(i, j - 1, k - 1)]!, cellId[cell(i, j, k - 1)]!, cellId[cell(i, j, k)]!, cellId[cell(i, j - 1, k)]!, !here);
        }
        // y edge: u = z, w = x → cells (i-1|i, j, k-1|k) ordered (z-,x-) (z+,x-) (z+,x+) (z-,x+)
        if (here !== values[node(i, j + 1, k)]! < 0) {
          quad(cellId[cell(i - 1, j, k - 1)]!, cellId[cell(i - 1, j, k)]!, cellId[cell(i, j, k)]!, cellId[cell(i, j, k - 1)]!, !here);
        }
        // z edge: u = x, w = y → cells (i-1|i, j-1|j, k)
        if (here !== values[node(i, j, k + 1)]! < 0) {
          quad(cellId[cell(i - 1, j - 1, k)]!, cellId[cell(i, j - 1, k)]!, cellId[cell(i, j, k)]!, cellId[cell(i - 1, j, k)]!, !here);
        }
      }
    }
  }

  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), anchors: Uint32Array.from(anchors) };
}
