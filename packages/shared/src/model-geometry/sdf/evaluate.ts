import { type SdfNode, type SdfTree } from '../../media-model-sdf';
import { rotationMatrix } from '../math';

/**
 * The SDF evaluator (Phase 104 Theme C): a tree compiled once into nested closures, so evaluating a
 * point allocates nothing. Every primitive is the exact (or, for the ellipsoid, a tight bound) distance
 * of Inigo Quilez's catalogue, in the node's own space; transforms map the point in and scale the
 * distance back out. Alongside the field, the compiler works out each node's bounding box and a
 * Lipschitz bound — how fast the field can change per metre — which together let the bake skip whole
 * blocks of the grid that are provably far from the surface.
 */

/** Records the leaf whose own surface is nearest a point — how a baked vertex picks its group. */
export type LeafProbe = { leaf: number; best: number };
/** Field at (x, y, z); `s` is the accumulated scale from the root (for the probe's world distances). */
export type SdfFn = (x: number, y: number, z: number, s: number, probe: LeafProbe | null) => number;

export type Box = { min: [number, number, number]; max: [number, number, number] };

export type CompiledSdf = {
  /** Field in tree space (negative inside). */
  distance: (x: number, y: number, z: number) => number;
  /** Field plus the index (into `leaves`) of the primitive whose surface is nearest. */
  nearestLeaf: (x: number, y: number, z: number) => number;
  /** Conservative bounds of the surface in tree space; `null` when the tree is empty. */
  bounds: Box | null;
  /** Upper bound on |∇f|: a point at distance d is at least d / lipschitz from the surface. */
  lipschitz: number;
  /** Every primitive, depth first, with the colour it inherits. */
  leaves: { name: string; color: string | undefined }[];
};

type Compiled = { fn: SdfFn; box: Box | null; lip: number };

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Polynomial smooth minimum (quadratic); exact `min` when `k` is 0. Lowers the result by at most k/4. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k);

// --- primitives -------------------------------------------------------------------------------------

export const sdSphere = (x: number, y: number, z: number, r: number): number => Math.hypot(x, y, z) - r;

export function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  if (k1 === 0) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

export function sdBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, r: number): number {
  const rr = Math.min(r, hx, hy, hz);
  const qx = Math.abs(x) - (hx - rr);
  const qy = Math.abs(y) - (hy - rr);
  const qz = Math.abs(z) - (hz - rr);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr;
}

export function sdCapsule(x: number, y: number, z: number, r: number, height: number): number {
  const half = height / 2;
  return Math.hypot(x, y - clamp(y, -half, half), z) - r;
}

export function sdCylinder(x: number, y: number, z: number, r: number, height: number): number {
  const dx = Math.hypot(x, z) - r;
  const dy = Math.abs(y) - height / 2;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

export function sdTorus(x: number, y: number, z: number, radius: number, tube: number): number {
  return Math.hypot(Math.hypot(x, z) - radius, y) - tube;
}

/** Capped cone: base radius `r1` at y = −h/2, apex (radius 0) at +h/2 — exact. */
export function sdCone(x: number, y: number, z: number, r1: number, height: number): number {
  const h = height / 2;
  const r2 = 0;
  const qx = Math.hypot(x, z);
  const qy = y;
  const k2x = r2 - r1;
  const k2y = 2 * h;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2);
  const cay = Math.abs(qy) - h;
  const t = clamp(((r2 - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y), 0, 1);
  const cbx = qx - r2 + k2x * t;
  const cby = qy - h + k2y * t;
  const sign = cbx < 0 && cay < 0 ? -1 : 1;
  return sign * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}

// --- noise --------------------------------------------------------------------------------------------

function hash3(i: number, j: number, k: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 32767.5 - 1; // [-1, 1]
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth value noise in [-1, 1], deterministic per seed. */
export function valueNoise(x: number, y: number, z: number, seed = 0): number {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = fade(x - i), fy = fade(y - j), fz = fade(z - k);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (di: number, dj: number, dk: number): number => hash3(i + di, j + dj, k + dk, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

// --- boxes ----------------------------------------------------------------------------------------------

const box = (min: [number, number, number], max: [number, number, number]): Box => ({ min, max });
const sym = (x: number, y: number, z: number): Box => box([-x, -y, -z], [x, y, z]);
const expand = (b: Box | null, by: number): Box | null => (b ? box([b.min[0] - by, b.min[1] - by, b.min[2] - by], [b.max[0] + by, b.max[1] + by, b.max[2] + by]) : null);
const merge = (a: Box | null, b: Box | null): Box | null =>
  !a ? b : !b ? a : box([Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])], [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]);
function intersectBoxes(a: Box | null, b: Box | null): Box | null {
  if (!a || !b) return null;
  const out = box([Math.max(a.min[0], b.min[0]), Math.max(a.min[1], b.min[1]), Math.max(a.min[2], b.min[2])], [Math.min(a.max[0], b.max[0]), Math.min(a.max[1], b.max[1]), Math.min(a.max[2], b.max[2])]);
  return out.min[0] <= out.max[0] && out.min[1] <= out.max[1] && out.min[2] <= out.max[2] ? out : null;
}
const corners = (b: Box): [number, number, number][] => {
  const out: [number, number, number][] = [];
  for (let c = 0; c < 8; c += 1) out.push([c & 1 ? b.max[0] : b.min[0], c & 2 ? b.max[1] : b.min[1], c & 4 ? b.max[2] : b.min[2]]);
  return out;
};

// --- the compiler -----------------------------------------------------------------------------------

/** Compiles a tree; throws nothing for a schema-valid tree. */
export function compileSdf(tree: SdfTree): CompiledSdf {
  const leaves: CompiledSdf['leaves'] = [];

  const compile = (node: SdfNode, inherited: string | undefined): Compiled => {
    const color = node.color ?? inherited;
    const inner = compileLocal(node, color);
    return withTransform(node, inner);
  };

  const leaf = (eval_: (x: number, y: number, z: number) => number, b: Box, color: string | undefined, name: string): Compiled => {
    const id = leaves.length;
    leaves.push({ name, color });
    const fn: SdfFn = (x, y, z, s, probe) => {
      const d = eval_(x, y, z);
      if (probe) {
        const w = Math.abs(d * s);
        if (w < probe.best) {
          probe.best = w;
          probe.leaf = id;
        }
      }
      return d;
    };
    return { fn, box: b, lip: 1 };
  };

  const compileLocal = (node: SdfNode, color: string | undefined): Compiled => {
    switch (node.kind) {
      case 'sphere': {
        const r = node.radius;
        return leaf((x, y, z) => sdSphere(x, y, z, r), sym(r, r, r), color, node.name);
      }
      case 'ellipsoid': {
        const [rx, ry, rz] = node.radii;
        const c = leaf((x, y, z) => sdEllipsoid(x, y, z, rx, ry, rz), sym(rx, ry, rz), color, node.name);
        // The ellipsoid's field over-reads the true distance as it gets more eccentric: sampled against brute-force
        // distances it peaks at 1.42× for a 2:1 ellipsoid, 1.62× for 2.5:1 and 2.07× for 10:1. This bound sits above all three.
        const ratio = Math.max(rx, ry, rz) / Math.min(rx, ry, rz);
        c.lip = Math.min(ratio, 1.1 + 1.6 * Math.log10(ratio));
        return c;
      }
      case 'box': {
        const [sx, sy, sz] = node.size;
        const r = node.radius ?? 0;
        return leaf((x, y, z) => sdBox(x, y, z, sx / 2, sy / 2, sz / 2, r), sym(sx / 2, sy / 2, sz / 2), color, node.name);
      }
      case 'capsule': {
        const { radius: r, height: h } = node;
        return leaf((x, y, z) => sdCapsule(x, y, z, r, h), sym(r, h / 2 + r, r), color, node.name);
      }
      case 'cylinder': {
        const { radius: r, height: h } = node;
        return leaf((x, y, z) => sdCylinder(x, y, z, r, h), sym(r, h / 2, r), color, node.name);
      }
      case 'cone': {
        const { radius: r, height: h } = node;
        return leaf((x, y, z) => sdCone(x, y, z, r, h), sym(r, h / 2, r), color, node.name);
      }
      case 'torus': {
        const { radius: R, tube: t } = node;
        return leaf((x, y, z) => sdTorus(x, y, z, R, t), sym(R + t, t, R + t), color, node.name);
      }
      case 'union':
      case 'subtract':
      case 'intersect': {
        const parts = node.children.map((c) => compile(c, color));
        const k = node.k ?? 0;
        const lip = Math.max(...parts.map((p) => p.lip));
        const fns = parts.map((p) => p.fn);
        if (node.kind === 'union') {
          return { fn: foldUnion(fns, k), box: expand(parts.map((p) => p.box).reduce(merge, null), k / 4), lip };
        }
        if (node.kind === 'intersect') {
          const fold = foldUnion(fns.map((f) => negate(f)), k);
          return { fn: (x, y, z, s, probe) => -fold(x, y, z, s, probe), box: parts.map((p) => p.box).reduce((a, b) => intersectBoxes(a, b)) ?? parts[0]!.box, lip };
        }
        const first = fns[0]!;
        const rest = fns.length > 1 ? foldUnion(fns.slice(1), k) : null;
        return {
          fn: rest ? (x, y, z, s, probe) => smax(first(x, y, z, s, probe), -rest(x, y, z, s, probe), k) : first,
          box: expand(parts[0]!.box, k / 4),
          lip,
        };
      }
      case 'displace': {
        const inner = compile(node.children[0]!, color);
        const octaves = node.octaves ?? 1;
        const { amplitude: amp, frequency: freq } = node;
        const seed = node.seed ?? 0;
        let total = 0;
        for (let o = 0; o < octaves; o += 1) total += 0.5 ** o;
        const fn = inner.fn;
        const shift = (seed % 997) * 13.37;
        return {
          fn: (x, y, z, s, probe) => {
            let n = 0;
            let f = freq;
            let a = 1;
            for (let o = 0; o < octaves; o += 1) {
              n += a * valueNoise(x * f + shift, y * f + shift * 0.5, z * f - shift, seed + o);
              f *= 2;
              a *= 0.5;
            }
            return fn(x, y, z, s, probe) + (amp * n) / total;
          },
          box: expand(inner.box, Math.abs(amp)),
          // Value noise's slope is at most ~1.9 per unit of its input; each octave doubles frequency and halves amplitude.
          lip: inner.lip + (Math.abs(amp) * freq * 1.9 * octaves) / total,
        };
      }
      case 'twist': {
        const inner = compile(node.children[0]!, color);
        const rate = (node.angle * Math.PI) / 180;
        const fn = inner.fn;
        const b = inner.box;
        let R = 0;
        if (b) for (const [x, , z] of corners(b)) R = Math.max(R, Math.hypot(x, z));
        return {
          fn: (x, y, z, s, probe) => {
            const a = -rate * y;
            const c = Math.cos(a), sn = Math.sin(a);
            return fn(c * x - sn * z, y, sn * x + c * z, s, probe);
          },
          box: b ? box([-R, b.min[1], -R], [R, b.max[1], R]) : null,
          lip: inner.lip * Math.sqrt(1 + (rate * R) ** 2),
        };
      }
      case 'bend': {
        const inner = compile(node.children[0]!, color);
        const rate = (node.angle * Math.PI) / 180;
        const fn = inner.fn;
        const b = inner.box;
        let R = 0;
        if (b) for (const [x, y] of corners(b)) R = Math.max(R, Math.hypot(x, y));
        return {
          fn: (x, y, z, s, probe) => {
            const a = -rate * x;
            const c = Math.cos(a), sn = Math.sin(a);
            return fn(c * x - sn * y, sn * x + c * y, z, s, probe);
          },
          box: b ? box([-R, -R, b.min[2]], [R, R, b.max[2]]) : null,
          lip: inner.lip * Math.sqrt(1 + (rate * R) ** 2),
        };
      }
      case 'round': {
        const inner = compile(node.children[0]!, color);
        const r = node.radius;
        const fn = inner.fn;
        return { fn: (x, y, z, s, probe) => fn(x, y, z, s, probe) - r, box: expand(inner.box, r), lip: inner.lip };
      }
      case 'shell': {
        const inner = compile(node.children[0]!, color);
        const t = node.thickness / 2;
        const fn = inner.fn;
        return { fn: (x, y, z, s, probe) => Math.abs(fn(x, y, z, s, probe)) - t, box: expand(inner.box, t), lip: inner.lip };
      }
      case 'mirror': {
        const inner = compile(node.children[0]!, color);
        const fn = inner.fn;
        const axis = node.axis === 'x' ? 0 : node.axis === 'y' ? 1 : 2;
        const b = inner.box;
        let mirrored: Box | null = null;
        if (b) {
          const m = Math.max(Math.abs(b.min[axis]!), Math.abs(b.max[axis]!));
          mirrored = box([...b.min] as [number, number, number], [...b.max] as [number, number, number]);
          mirrored.min[axis] = -m;
          mirrored.max[axis] = m;
        }
        const call: SdfFn =
          axis === 0
            ? (x, y, z, s, probe) => fn(Math.abs(x), y, z, s, probe)
            : axis === 1
              ? (x, y, z, s, probe) => fn(x, Math.abs(y), z, s, probe)
              : (x, y, z, s, probe) => fn(x, y, Math.abs(z), s, probe);
        return { fn: call, box: mirrored, lip: inner.lip };
      }
    }
  };

  const roots = tree.nodes.map((n) => compile(n, undefined));
  const blend = tree.blend ?? 0;
  const rootFn = foldUnion(roots.map((r) => r.fn), blend);
  const bounds = expand(roots.map((r) => r.box).reduce(merge, null), blend / 4);
  const lipschitz = Math.max(1, ...roots.map((r) => r.lip));
  const probe: LeafProbe = { leaf: 0, best: Infinity };
  return {
    distance: (x, y, z) => rootFn(x, y, z, 1, null),
    nearestLeaf: (x, y, z) => {
      probe.leaf = 0;
      probe.best = Infinity;
      rootFn(x, y, z, 1, probe);
      return probe.leaf;
    },
    bounds,
    lipschitz,
    leaves,
  };
}

const negate = (f: SdfFn): SdfFn => (x, y, z, s, probe) => -f(x, y, z, s, probe);

function foldUnion(fns: SdfFn[], k: number): SdfFn {
  if (fns.length === 1) return fns[0]!;
  if (fns.length === 2) {
    const [a, b] = fns as [SdfFn, SdfFn];
    return (x, y, z, s, probe) => smin(a(x, y, z, s, probe), b(x, y, z, s, probe), k);
  }
  return (x, y, z, s, probe) => {
    let d = fns[0]!(x, y, z, s, probe);
    for (let i = 1; i < fns.length; i += 1) d = smin(d, fns[i]!(x, y, z, s, probe), k);
    return d;
  };
}

/** Wraps a node's local field in its transform: point into node space, distance back out. */
function withTransform(node: SdfNode, inner: Compiled): Compiled {
  const [px, py, pz] = node.position ?? [0, 0, 0];
  const rot = node.rotation ?? [0, 0, 0];
  const sc = node.scale ?? 1;
  const rotated = rot[0] !== 0 || rot[1] !== 0 || rot[2] !== 0;
  if (!rotated && sc === 1 && px === 0 && py === 0 && pz === 0) return inner;
  // Row-major R maps local → parent; its transpose maps back.
  const r = rotationMatrix(rot);
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = r as [number, number, number, number, number, number, number, number, number];
  const fn = inner.fn;
  const inv = 1 / sc;
  const out: SdfFn = rotated
    ? (x, y, z, s, probe) => {
        const dx = x - px, dy = y - py, dz = z - pz;
        return fn((r0 * dx + r3 * dy + r6 * dz) * inv, (r1 * dx + r4 * dy + r7 * dz) * inv, (r2 * dx + r5 * dy + r8 * dz) * inv, s * sc, probe) * sc;
      }
    : (x, y, z, s, probe) => fn((x - px) * inv, (y - py) * inv, (z - pz) * inv, s * sc, probe) * sc;
  let b: Box | null = null;
  if (inner.box) {
    for (const [x, y, z] of corners(inner.box)) {
      const wx = (r0 * x + r1 * y + r2 * z) * sc + px;
      const wy = (r3 * x + r4 * y + r5 * z) * sc + py;
      const wz = (r6 * x + r7 * y + r8 * z) * sc + pz;
      b = merge(b, box([wx, wy, wz], [wx, wy, wz]));
    }
  }
  return { fn: out, box: b, lip: inner.lip };
}

/** Field of a tree at one point — a convenience for tests and probes; bakes use {@link compileSdf}. */
export const evaluateSdf = (tree: SdfTree, x: number, y: number, z: number): number => compileSdf(tree).distance(x, y, z);

