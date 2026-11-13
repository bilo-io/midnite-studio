export const TRAIL_LENGTH = 500;

export type Trails = {
  readonly count: number;
  readonly length: number;
  /** Records one position per body (3 floats each) into the rings. */
  push(positions: Float32Array): void;
  /** Number of points recorded so far for any body (they advance together). */
  size(): number;
  /** Writes body `i`'s trail, oldest first, into `out` (3 floats per point) and returns the points written. */
  write(i: number, out: Float32Array): number;
  clear(): void;
};

/** One fixed-length ring buffer of positions per body (Phase 127 Theme D.3); no allocation per frame. */
export function createTrails(count: number, length = TRAIL_LENGTH): Trails {
  const data = new Float32Array(count * length * 3);
  let head = 0;
  let filled = 0;
  return {
    count,
    length,
    push(positions) {
      for (let i = 0; i < count; i++) {
        const o = (i * length + head) * 3;
        data[o] = positions[3 * i]!;
        data[o + 1] = positions[3 * i + 1]!;
        data[o + 2] = positions[3 * i + 2]!;
      }
      head = (head + 1) % length;
      filled = Math.min(filled + 1, length);
    },
    size: () => filled,
    write(i, out) {
      const start = (head - filled + length) % length;
      for (let k = 0; k < filled; k++) {
        const o = (i * length + ((start + k) % length)) * 3;
        out[3 * k] = data[o]!;
        out[3 * k + 1] = data[o + 1]!;
        out[3 * k + 2] = data[o + 2]!;
      }
      return filled;
    },
    clear() {
      head = 0;
      filled = 0;
    },
  };
}
