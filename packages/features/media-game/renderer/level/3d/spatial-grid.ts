/**
 * A uniform grid over item footprints (Phase 136 Theme B, Decision 7). A query visits only the cells its rectangle
 * covers, so culling costs what is near the camera, not what is in the level. Pure: no three.
 */
export type Footprint = { minX: number; minZ: number; maxX: number; maxZ: number };

export const DEFAULT_CELL = 16;

export class SpatialGrid {
  readonly cell: number;
  private readonly cells = new Map<string, number[]>();
  /** Per-item stamp so an item spanning several cells is returned once per query. */
  private stamps: Uint32Array;
  private stamp = 0;
  /** How many cells the last query visited (the readout and the tests read it). */
  lastVisited = 0;

  constructor(items: ReadonlyArray<{ index: number; bounds: Footprint }>, cell = DEFAULT_CELL) {
    this.cell = cell;
    this.stamps = new Uint32Array(items.length);
    for (const item of items) {
      const [i0, j0, i1, j1] = this.range(item.bounds);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const key = `${i},${j}`;
          const list = this.cells.get(key);
          if (list) list.push(item.index);
          else this.cells.set(key, [item.index]);
        }
      }
    }
  }

  private range(b: Footprint): [number, number, number, number] {
    const c = this.cell;
    return [Math.floor(b.minX / c), Math.floor(b.minZ / c), Math.floor(b.maxX / c), Math.floor(b.maxZ / c)];
  }

  get cellCount(): number {
    return this.cells.size;
  }

  /** Every item whose footprint's cells overlap `rect` (a superset: the caller does the exact test). */
  query(rect: Footprint, out: number[] = []): number[] {
    out.length = 0;
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.stamps.fill(0);
      this.stamp = 1;
    }
    const [i0, j0, i1, j1] = this.range(rect);
    let visited = 0;
    // A huge rectangle (a camera far out) walks the occupied cells instead of the empty ones.
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > this.cells.size) {
      for (const [key, list] of this.cells) {
        const comma = key.indexOf(',');
        const i = Number(key.slice(0, comma)), j = Number(key.slice(comma + 1));
        if (i < i0 || i > i1 || j < j0 || j > j1) continue;
        visited++;
        this.collect(list, out);
      }
    } else {
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const list = this.cells.get(`${i},${j}`);
          if (!list) continue;
          visited++;
          this.collect(list, out);
        }
      }
    }
    this.lastVisited = visited;
    return out;
  }

  private collect(list: readonly number[], out: number[]): void {
    for (const index of list) {
      if (this.stamps[index] === this.stamp) continue;
      this.stamps[index] = this.stamp;
      out.push(index);
    }
  }
}

/** The XZ bounding rectangle of a set of 3D points (a frustum's corners), metres. */
export function xzRect(points: ReadonlyArray<readonly [number, number, number]>): Footprint {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, , z] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}
