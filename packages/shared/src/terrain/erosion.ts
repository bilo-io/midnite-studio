import { createRng } from './noise';

/**
 * Particle-based hydraulic erosion (Phase 105 Theme C): each droplet rolls downhill, picks up
 * sediment where it is fast and steep and drops it where it slows, and a brush spreads every pick-up
 * over a small radius so no single cell is trenched. Sediment is conserved: what a droplet still
 * carries when its life ends is deposited where it stopped, so `eroded` and `deposited` match.
 */
export const EROSION_MAX_ITERATIONS = 500_000;

const INERTIA = 0.05;
const CAPACITY = 4;
const DEPOSITION = 0.3;
const EROSION = 0.3;
const EVAPORATION = 0.01;
const GRAVITY = 4;
const MAX_LIFETIME = 30;
const BRUSH_RADIUS = 3;
const MIN_SLOPE = 0.01;

export type ErosionResult = { heights: Float32Array; eroded: number; deposited: number };

type Brush = { dx: Int8Array; dy: Int8Array; weights: Float32Array };

function makeBrush(): Brush {
  const dx: number[] = [];
  const dy: number[] = [];
  const weights: number[] = [];
  let sum = 0;
  for (let y = -BRUSH_RADIUS; y <= BRUSH_RADIUS; y += 1) {
    for (let x = -BRUSH_RADIUS; x <= BRUSH_RADIUS; x += 1) {
      const d2 = x * x + y * y;
      if (d2 > BRUSH_RADIUS * BRUSH_RADIUS) continue;
      const w = 1 - Math.sqrt(d2) / BRUSH_RADIUS;
      dx.push(x);
      dy.push(y);
      weights.push(w);
      sum += w;
    }
  }
  return { dx: Int8Array.from(dx), dy: Int8Array.from(dy), weights: Float32Array.from(weights.map((w) => w / sum)) };
}

/**
 * Erodes a copy of `h` (a `res × res` field). `iterations` is hard-capped at {@link EROSION_MAX_ITERATIONS};
 * `onProgress(fraction)` fires at every 5 %.
 */
export function erode(
  h: Float32Array,
  res: number,
  opts: { iterations: number; seed: number },
  onProgress: (fraction: number) => void = () => undefined,
): ErosionResult {
  const heights = h.slice();
  const iterations = Math.max(0, Math.min(EROSION_MAX_ITERATIONS, Math.floor(opts.iterations)));
  const rng = createRng(opts.seed);
  const brush = makeBrush();
  let eroded = 0;
  let deposited = 0;
  const step = Math.max(1, Math.floor(iterations / 20));

  const deposit = (px: number, py: number, amount: number) => {
    const x = Math.floor(px);
    const y = Math.floor(py);
    const fx = px - x;
    const fy = py - y;
    const i = y * res + x;
    heights[i] = heights[i]! + amount * (1 - fx) * (1 - fy);
    heights[i + 1] = heights[i + 1]! + amount * fx * (1 - fy);
    heights[i + res] = heights[i + res]! + amount * (1 - fx) * fy;
    heights[i + res + 1] = heights[i + res + 1]! + amount * fx * fy;
    deposited += amount;
  };

  for (let it = 0; it < iterations; it += 1) {
    if (it > 0 && it % step === 0) onProgress(it / iterations);
    let px = rng() * (res - 1.001);
    let py = rng() * (res - 1.001);
    let dirX = 0;
    let dirY = 0;
    let speed = 1;
    let water = 1;
    let sediment = 0;
    for (let life = 0; life < MAX_LIFETIME; life += 1) {
      const x = Math.floor(px);
      const y = Math.floor(py);
      const fx = px - x;
      const fy = py - y;
      const i = y * res + x;
      const h00 = heights[i]!;
      const h10 = heights[i + 1]!;
      const h01 = heights[i + res]!;
      const h11 = heights[i + res + 1]!;
      const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
      const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      const height = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
      dirX = dirX * INERTIA - gx * (1 - INERTIA);
      dirY = dirY * INERTIA - gy * (1 - INERTIA);
      const len = Math.hypot(dirX, dirY);
      if (len < 1e-9) break;
      dirX /= len;
      dirY /= len;
      const nx = px + dirX;
      const ny = py + dirY;
      if (nx < 0 || ny < 0 || nx >= res - 1.001 || ny >= res - 1.001) break;

      const nxi = Math.floor(nx);
      const nyi = Math.floor(ny);
      const nfx = nx - nxi;
      const nfy = ny - nyi;
      const ni = nyi * res + nxi;
      const newHeight =
        heights[ni]! * (1 - nfx) * (1 - nfy) +
        heights[ni + 1]! * nfx * (1 - nfy) +
        heights[ni + res]! * (1 - nfx) * nfy +
        heights[ni + res + 1]! * nfx * nfy;
      const delta = newHeight - height;
      const capacity = Math.max(-delta, MIN_SLOPE) * speed * water * CAPACITY;

      if (sediment > capacity || delta > 0) {
        const amount = delta > 0 ? Math.min(delta, sediment) : (sediment - capacity) * DEPOSITION;
        sediment -= amount;
        deposit(px, py, amount);
      } else {
        const amount = Math.min((capacity - sediment) * EROSION, -delta);
        const cx = Math.round(px);
        const cy = Math.round(py);
        for (let b = 0; b < brush.weights.length; b += 1) {
          const bx = cx + brush.dx[b]!;
          const by = cy + brush.dy[b]!;
          // Mass that would fall off the grid is simply not taken, so conservation holds.
          if (bx < 0 || by < 0 || bx >= res || by >= res) continue;
          const take = amount * brush.weights[b]!;
          heights[by * res + bx] = heights[by * res + bx]! - take;
          sediment += take;
          eroded += take;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - delta * GRAVITY));
      water *= 1 - EVAPORATION;
      px = nx;
      py = ny;
    }
    // A droplet's life is over: whatever it still carries settles where it stopped.
    if (sediment > 0) deposit(px, py, sediment);
  }
  onProgress(1);
  return { heights, eroded, deposited };
}
