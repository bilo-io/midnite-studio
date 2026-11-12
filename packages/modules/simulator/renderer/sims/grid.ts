/** Pure helpers for editing and drawing a cell grid, kept out of the view so they test without a canvas. */

export type View = { zoom: number; x: number; y: number };
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 16;

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** The cell under a pointer given the canvas's on-screen rectangle; `null` outside the grid. */
export function cellAt(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, w: number, h: number): [number, number] | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.floor(((clientX - rect.left) / rect.width) * w);
  const y = Math.floor(((clientY - rect.top) / rect.height) * h);
  return x < 0 || y < 0 || x >= w || y >= h ? null : [x, y];
}

/** Cells on the line between two cells (Bresenham), so a fast drag leaves no gaps. */
export function lineCells(a: [number, number], b: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  let [x, y] = a;
  const dx = Math.abs(b[0] - x);
  const dy = -Math.abs(b[1] - y);
  const sx = x < b[0] ? 1 : -1;
  const sy = y < b[1] ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === b[0] && y === b[1]) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Sets `value` at each cell; returns how many cells changed. */
export function paintCells(grid: Uint8Array, w: number, h: number, cells: readonly [number, number][], value: 0 | 1): number {
  let changed = 0;
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (grid[i] !== value) {
      grid[i] = value;
      changed += 1;
    }
  }
  return changed;
}

/** Stamps a pattern's cells with its top-left at (ox, oy), wrapping on the torus. */
export function stampPattern(grid: Uint8Array, w: number, h: number, cells: readonly [number, number][], ox: number, oy: number): void {
  for (const [x, y] of cells) grid[(((oy + y) % h) + h) % h * w + ((((ox + x) % w) + w) % w)] = 1;
}

const ALIVE = [129, 140, 248] as const;
const DEAD = [17, 17, 27] as const;

/** Writes a 0/1 snapshot into `image` (RGBA, 1 px per cell). */
export function fillImage(image: { data: Uint8ClampedArray }, cells: ArrayLike<number>, count: number): void {
  const d = image.data;
  for (let i = 0; i < count; i++) {
    const c = cells[i]! > 0.5 ? ALIVE : DEAD;
    const o = i * 4;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = 255;
  }
}
