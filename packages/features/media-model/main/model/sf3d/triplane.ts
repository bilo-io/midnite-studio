/**
 * The triplane and SF3D's colour head, in TypeScript — what the texture bake queries per texel.
 *
 * The backbone's `triplane` is `[1, 3, C, R, R]` (C = 40 channels, R = 384). A world point
 * (`|p| <= SF3D_RADIUS`) maps to [-1, 1], then each plane is sampled with bilinear `grid_sample`
 * (`align_corners=True`, zeros outside): plane 0 at (x, y), plane 1 at (x, z), plane 2 at (y, z),
 * the grid's first coordinate indexing columns. The three C-channel samples are concatenated
 * plane-major into the 3C = 120 inputs of the colour MLP (`features_mlp_weights.json`: four linear
 * layers, SiLU between them, sigmoid out) — the same decoder head SF3D's PyTorch graph applies.
 */

/** Half the side of SF3D's bounding cube (`radius: 0.87`). */
export const SF3D_RADIUS = 0.87;

export type Triplane = { data: Float32Array; channels: number; resolution: number };

export type ColorMlp = {
  /** Row-major `[out][in]` weights and biases, in layer order. */
  layers: { w: Float32Array; b: Float32Array; inputs: number; outputs: number }[];
};

/** Parses `features_mlp_weights.json` (`w0..w3`, `b0..b3`) into flat layers, checking the shapes chain. */
export function parseColorMlp(json: unknown): ColorMlp {
  const record = json as Record<string, unknown>;
  const layers: ColorMlp['layers'] = [];
  for (let i = 0; record[`w${i}`] !== undefined; i += 1) {
    const w = record[`w${i}`] as number[][];
    const b = record[`b${i}`] as number[];
    if (!Array.isArray(w) || !Array.isArray(b) || w.length !== b.length || w.length === 0) {
      throw new Error(`features_mlp_weights.json: layer ${i} is malformed.`);
    }
    const inputs = w[0]!.length;
    if (i > 0 && inputs !== layers[i - 1]!.outputs) throw new Error(`features_mlp_weights.json: layer ${i} takes ${inputs}, previous gives ${layers[i - 1]!.outputs}.`);
    layers.push({ w: Float32Array.from(w.flat()), b: Float32Array.from(b), inputs, outputs: w.length });
  }
  if (layers.length === 0) throw new Error('features_mlp_weights.json has no layers.');
  return { layers };
}

/** Bilinear sample of one plane at normalised (u, v) ∈ [-1, 1], added channel by channel into `out[offset..]`. */
function samplePlane(tp: Triplane, plane: number, u: number, v: number, out: Float32Array, offset: number): void {
  const { channels: C, resolution: R, data } = tp;
  const x = ((u + 1) / 2) * (R - 1);
  const y = ((v + 1) / 2) * (R - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const base = plane * C * R * R;
  for (let c = 0; c < C; c += 1) out[offset + c] = 0;
  const tap = (xi: number, yi: number, weight: number) => {
    if (weight === 0 || xi < 0 || yi < 0 || xi >= R || yi >= R) return;
    const at = base + yi * R + xi;
    for (let c = 0; c < C; c += 1) out[offset + c]! += weight * data[at + c * R * R]!;
  };
  tap(x0, y0, (1 - fx) * (1 - fy));
  tap(x0 + 1, y0, fx * (1 - fy));
  tap(x0, y0 + 1, (1 - fx) * fy);
  tap(x0 + 1, y0 + 1, fx * fy);
}

/** The 3C features at a world point (SF3D space, not glTF). */
export function sampleTriplane(tp: Triplane, x: number, y: number, z: number, out: Float32Array = new Float32Array(tp.channels * 3)): Float32Array {
  const n = (p: number) => p / SF3D_RADIUS;
  const nx = n(x);
  const ny = n(y);
  const nz = n(z);
  samplePlane(tp, 0, nx, ny, out, 0);
  samplePlane(tp, 1, nx, nz, out, tp.channels);
  samplePlane(tp, 2, ny, nz, out, tp.channels * 2);
  return out;
}

const silu = (x: number) => x / (1 + Math.exp(-x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Runs the colour MLP; `scratch` buffers are reused across calls by `createColorSampler`. */
function runMlp(mlp: ColorMlp, input: Float32Array, scratch: [Float32Array, Float32Array]): Float32Array {
  let current = input;
  mlp.layers.forEach((layer, index) => {
    const next = scratch[index % 2]!;
    const last = index === mlp.layers.length - 1;
    for (let o = 0; o < layer.outputs; o += 1) {
      let sum = layer.b[o]!;
      const row = o * layer.inputs;
      for (let i = 0; i < layer.inputs; i += 1) sum += layer.w[row + i]! * current[i]!;
      next[o] = last ? sigmoid(sum) : silu(sum);
    }
    current = next;
  });
  return current;
}

/** A per-point colour function over one triplane: world xyz (SF3D space) → linear 0..1 RGB. */
export function createColorSampler(tp: Triplane, mlp: ColorMlp): (x: number, y: number, z: number, out: Float32Array) => void {
  const expected = tp.channels * 3;
  if (mlp.layers[0]!.inputs !== expected) throw new Error(`The colour MLP takes ${mlp.layers[0]!.inputs} features; the triplane gives ${expected}.`);
  const width = Math.max(...mlp.layers.map((l) => l.outputs));
  const feats = new Float32Array(expected);
  const scratch: [Float32Array, Float32Array] = [new Float32Array(width), new Float32Array(width)];
  return (x, y, z, out) => {
    sampleTriplane(tp, x, y, z, feats);
    const rgb = runMlp(mlp, feats, scratch);
    out[0] = rgb[0]!;
    out[1] = rgb[1]!;
    out[2] = rgb[2]!;
  };
}
