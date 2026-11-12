export type SpatialHash = {
  /** Re-buckets the first `count` points of `positions` (3 floats each, expected inside [0, bounds]). */
  rebuild(positions: Float32Array, count: number): void;
  /** Calls `fn(j, distSq)` for every point j != i within `radius` of point i. */
  forEachNear(i: number, radius: number, fn: (j: number, distSq: number) => void): void;
};

/**
 * A uniform grid over a cube [0, bounds]^3 (Phase 127 Theme E.1). Flat typed arrays (a counting sort into cell
 * start offsets), rebuilt every tick with no allocation after the first call that grows them; points outside
 * the cube are clamped into the edge cells, so a stray one is still found.
 */
export function createSpatialHash(cellSize: number, bounds: number): SpatialHash {
  const dim = Math.max(1, Math.ceil(bounds / cellSize));
  const cells = dim * dim * dim;
  const start = new Int32Array(cells + 1);
  const cursor = new Int32Array(cells);
  let items = new Int32Array(0);
  let cellOf = new Int32Array(0);
  let pos: Float32Array = new Float32Array(0);
  const axis = (v: number) => Math.min(dim - 1, Math.max(0, Math.floor(v / cellSize)));

  return {
    rebuild(positions, count) {
      pos = positions;
      if (items.length < count) {
        items = new Int32Array(count);
        cellOf = new Int32Array(count);
      }
      start.fill(0);
      for (let i = 0; i < count; i++) {
        const c = axis(positions[3 * i]!) + dim * (axis(positions[3 * i + 1]!) + dim * axis(positions[3 * i + 2]!));
        cellOf[i] = c;
        start[c + 1] = start[c + 1]! + 1;
      }
      for (let c = 0; c < cells; c++) start[c + 1] = start[c + 1]! + start[c]!;
      cursor.set(start.subarray(0, cells));
      for (let i = 0; i < count; i++) {
        const c = cellOf[i]!;
        items[cursor[c]!] = i;
        cursor[c] = cursor[c]! + 1;
      }
    },
    forEachNear(i, radius, fn) {
      const px = pos[3 * i]!;
      const py = pos[3 * i + 1]!;
      const pz = pos[3 * i + 2]!;
      const r2 = radius * radius;
      const x1 = axis(px + radius);
      const y1 = axis(py + radius);
      const z1 = axis(pz + radius);
      for (let z = axis(pz - radius); z <= z1; z++) {
        for (let y = axis(py - radius); y <= y1; y++) {
          for (let x = axis(px - radius); x <= x1; x++) {
            const c = x + dim * (y + dim * z);
            for (let k = start[c]!; k < start[c + 1]!; k++) {
              const j = items[k]!;
              if (j === i) continue;
              const dx = pos[3 * j]! - px;
              const dy = pos[3 * j + 1]! - py;
              const dz = pos[3 * j + 2]! - pz;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 <= r2) fn(j, d2);
            }
          }
        }
      }
    },
  };
}
