import { MODEL_MAX_PART_TRIANGLES, type ModelModifier } from '../media-model';
import { AXES, composeLocal, identity, translation, v3, type AxisName, type Mat4, type Vec3 } from './math';
import { appendSoup, bounds, pointAt, transformSoup, triangleCount, weld, type RawMesh, type Soup } from './raw';

/**
 * The modifier stack: bevel, subdivision smoothing, mirror, linear and radial arrays, and the three
 * deformers (twist, taper, bend). Every modifier maps a welded triangle soup to a welded soup, so
 * they compose in any order; normals are recomputed once at the end by the caller.
 */

const edgeKey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);

// --- tessellation (so a box can twist) -------------------------------------------

/** Splits every edge longer than `maxEdge` at its midpoint (crack-free: midpoints are shared per edge). */
export function tessellate(input: Soup, maxEdge: number, maxTris: number): Soup {
  let soup: Soup = { positions: [...input.positions], indices: [...input.indices] };
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const long = new Set<string>();
    for (let t = 0; t < soup.indices.length; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        const a = soup.indices[t + k]!;
        const b = soup.indices[t + ((k + 1) % 3)]!;
        if (v3.len(v3.sub(pointAt(soup.positions, a), pointAt(soup.positions, b))) > maxEdge) long.add(edgeKey(a, b));
      }
    }
    if (long.size === 0) break;
    const positions = [...soup.positions];
    const mids = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const key = edgeKey(a, b);
      let at = mids.get(key);
      if (at === undefined) {
        const p = v3.lerp(pointAt(positions, a), pointAt(positions, b), 0.5);
        at = positions.length / 3;
        positions.push(p[0], p[1], p[2]);
        mids.set(key, at);
      }
      return at;
    };
    const indices: number[] = [];
    for (let t = 0; t < soup.indices.length; t += 3) {
      let a = soup.indices[t]!;
      let b = soup.indices[t + 1]!;
      let c = soup.indices[t + 2]!;
      const flags = [long.has(edgeKey(a, b)), long.has(edgeKey(b, c)), long.has(edgeKey(c, a))];
      const count = flags.filter(Boolean).length;
      if (count === 0) {
        indices.push(a, b, c);
      } else if (count === 3) {
        const m0 = mid(a, b);
        const m1 = mid(b, c);
        const m2 = mid(c, a);
        indices.push(a, m0, m2, m0, b, m1, m2, m1, c, m0, m1, m2);
      } else if (count === 1) {
        // Rotate so the split edge is (a, b).
        if (flags[1]) [a, b, c] = [b, c, a];
        else if (flags[2]) [a, b, c] = [c, a, b];
        const m = mid(a, b);
        indices.push(a, m, c, m, b, c);
      } else {
        // Rotate so the unsplit edge is (c, a): edges (a, b) and (b, c) are split.
        if (!flags[0]) [a, b, c] = [b, c, a];
        else if (!flags[1]) [a, b, c] = [c, a, b];
        const m0 = mid(a, b);
        const m1 = mid(b, c);
        indices.push(m0, b, m1, a, m0, m1, a, m1, c);
      }
    }
    if (indices.length / 3 > maxTris) break;
    soup = { positions, indices };
  }
  return soup;
}

// --- Loop subdivision --------------------------------------------------------------

export function loopSubdivide(soup: Soup): Soup {
  const vertexCount = soup.positions.length / 3;
  type Edge = { a: number; b: number; opposite: number[]; mid: number };
  const edges = new Map<string, Edge>();
  const neighbours: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());
  for (let t = 0; t < soup.indices.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = soup.indices[t + k]!;
      const b = soup.indices[t + ((k + 1) % 3)]!;
      const opposite = soup.indices[t + ((k + 2) % 3)]!;
      const key = edgeKey(a, b);
      const edge = edges.get(key) ?? { a, b, opposite: [], mid: -1 };
      edge.opposite.push(opposite);
      edges.set(key, edge);
      neighbours[a]!.add(b);
      neighbours[b]!.add(a);
    }
  }
  const positions: number[] = [];
  const boundaryNeighbours: number[][] = Array.from({ length: vertexCount }, () => []);
  for (const edge of edges.values()) {
    if (edge.opposite.length !== 2) {
      boundaryNeighbours[edge.a]!.push(edge.b);
      boundaryNeighbours[edge.b]!.push(edge.a);
    }
  }
  for (let v = 0; v < vertexCount; v += 1) {
    const p = pointAt(soup.positions, v);
    const boundary = boundaryNeighbours[v]!;
    let out: Vec3;
    if (boundary.length >= 2) {
      const [n1, n2] = [pointAt(soup.positions, boundary[0]!), pointAt(soup.positions, boundary[1]!)];
      out = v3.add(v3.scale(p, 0.75), v3.scale(v3.add(n1, n2), 0.125));
    } else {
      const ring = [...neighbours[v]!];
      const n = ring.length;
      if (n < 3) out = p;
      else {
        const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
        let sum: Vec3 = [0, 0, 0];
        for (const r of ring) sum = v3.add(sum, pointAt(soup.positions, r));
        out = v3.add(v3.scale(p, 1 - n * beta), v3.scale(sum, beta));
      }
    }
    positions.push(out[0], out[1], out[2]);
  }
  for (const edge of edges.values()) {
    const a = pointAt(soup.positions, edge.a);
    const b = pointAt(soup.positions, edge.b);
    let p: Vec3;
    if (edge.opposite.length === 2) {
      const c = pointAt(soup.positions, edge.opposite[0]!);
      const d = pointAt(soup.positions, edge.opposite[1]!);
      p = v3.add(v3.scale(v3.add(a, b), 3 / 8), v3.scale(v3.add(c, d), 1 / 8));
    } else p = v3.scale(v3.add(a, b), 0.5);
    edge.mid = positions.length / 3;
    positions.push(p[0], p[1], p[2]);
  }
  const indices: number[] = [];
  for (let t = 0; t < soup.indices.length; t += 3) {
    const [a, b, c] = [soup.indices[t]!, soup.indices[t + 1]!, soup.indices[t + 2]!];
    const mab = edges.get(edgeKey(a, b))!.mid;
    const mbc = edges.get(edgeKey(b, c))!.mid;
    const mca = edges.get(edgeKey(c, a))!.mid;
    indices.push(a, mab, mca, b, mbc, mab, c, mca, mbc, mab, mbc, mca);
  }
  return { positions, indices };
}

// --- bevel ---------------------------------------------------------------------------

/**
 * Chamfers every hard edge (faces meeting at more than `hardAngle`°): each smooth region of the
 * surface is inset from its boundary by `amount`, the gap along every hard edge is filled with a
 * quad strip and each corner where three or more regions meet with a cap. One segment — combine
 * with `subdivide` for a rounded edge.
 */
export function bevelSoup(soup: Soup, amount: number, hardAngle = 35): Soup {
  const faceCount = soup.indices.length / 3;
  const tri = (f: number): [number, number, number] => [soup.indices[f * 3]!, soup.indices[f * 3 + 1]!, soup.indices[f * 3 + 2]!];
  const normals: Vec3[] = [];
  const centroids: Vec3[] = [];
  for (let f = 0; f < faceCount; f += 1) {
    const [a, b, c] = tri(f).map((i) => pointAt(soup.positions, i)) as [Vec3, Vec3, Vec3];
    normals.push(v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a))));
    centroids.push(v3.scale(v3.add(v3.add(a, b), c), 1 / 3));
  }
  const edgeFaces = new Map<string, number[]>();
  for (let f = 0; f < faceCount; f += 1) {
    const [a, b, c] = tri(f);
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(p, q);
      edgeFaces.set(key, [...(edgeFaces.get(key) ?? []), f]);
    }
  }
  const cosHard = Math.cos((hardAngle * Math.PI) / 180);
  const hard = new Set<string>();
  const parent = Array.from({ length: faceCount }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  for (const [key, faces] of edgeFaces) {
    if (faces.length !== 2) continue;
    if (v3.dot(normals[faces[0]!]!, normals[faces[1]!]!) < cosHard) hard.add(key);
    else parent[find(faces[0]!)] = find(faces[1]!);
  }
  if (hard.size === 0) return soup;

  const box = bounds(soup.positions);
  const dims = [0, 1, 2].map((i) => box.max[i]! - box.min[i]!).filter((d) => d > 1e-9);
  const inset = Math.min(amount, 0.45 * Math.min(...dims, Infinity));
  if (!Number.isFinite(inset) || inset <= 1e-9) return soup;

  const region = (f: number): number => find(f);
  const shift = new Map<string, Vec3>(); // `${vertex}|${region}` → displacement
  const addShift = (v: number, r: number, d: Vec3): void => {
    const key = `${v}|${r}`;
    shift.set(key, v3.add(shift.get(key) ?? [0, 0, 0], d));
  };
  for (const key of hard) {
    const [a, b] = key.split('_').map(Number) as [number, number];
    const pa = pointAt(soup.positions, a);
    const pb = pointAt(soup.positions, b);
    const along = v3.norm(v3.sub(pb, pa));
    for (const f of edgeFaces.get(key)!) {
      const toCentroid = v3.sub(centroids[f]!, pa);
      const inward = v3.norm(v3.sub(toCentroid, v3.scale(along, v3.dot(toCentroid, along))));
      const d = v3.scale(inward, inset);
      addShift(a, region(f), d);
      addShift(b, region(f), d);
    }
  }

  const positions: number[] = [];
  const made = new Map<string, number>();
  const vertexOf = (v: number, r: number): number => {
    const key = `${v}|${r}`;
    let at = made.get(key);
    if (at === undefined) {
      const p = v3.add(pointAt(soup.positions, v), shift.get(key) ?? [0, 0, 0]);
      at = positions.length / 3;
      positions.push(p[0], p[1], p[2]);
      made.set(key, at);
    }
    return at;
  };
  const indices: number[] = [];
  for (let f = 0; f < faceCount; f += 1) {
    const [a, b, c] = tri(f);
    indices.push(vertexOf(a, region(f)), vertexOf(b, region(f)), vertexOf(c, region(f)));
  }
  // Strips along hard edges.
  for (let f = 0; f < faceCount; f += 1) {
    const [a, b, c] = tri(f);
    for (const [v, w] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(v, w);
      if (!hard.has(key)) continue;
      const other = edgeFaces.get(key)!.find((g) => g !== f);
      if (other === undefined || f > other) continue; // one strip per edge
      // This face walks v→w; the other walks w→v.
      const r1 = region(f);
      const r2 = region(other);
      const A = vertexOf(w, r1);
      const B = vertexOf(v, r1);
      const C = vertexOf(v, r2);
      const D = vertexOf(w, r2);
      indices.push(A, B, C, A, C, D);
    }
  }
  // Corner caps where ≥ 3 regions meet.
  const regionsAt = new Map<number, Set<number>>();
  const normalAt = new Map<number, Vec3>();
  for (let f = 0; f < faceCount; f += 1) {
    for (const v of tri(f)) {
      const set = regionsAt.get(v) ?? new Set<number>();
      set.add(region(f));
      regionsAt.set(v, set);
      normalAt.set(v, v3.add(normalAt.get(v) ?? [0, 0, 0], normals[f]!));
    }
  }
  for (const [v, set] of regionsAt) {
    if (set.size < 3) continue;
    const n = v3.norm(normalAt.get(v)!);
    const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = v3.norm(v3.cross(helper, n));
    const e2 = v3.cross(n, e1);
    const p0 = pointAt(soup.positions, v);
    const ring = [...set]
      .map((r) => {
        const index = vertexOf(v, r);
        const d = v3.sub(pointAt(positions, index), p0);
        return { index, angle: Math.atan2(v3.dot(d, e2), v3.dot(d, e1)) };
      })
      .sort((x, y) => x.angle - y.angle);
    for (let i = 1; i < ring.length - 1; i += 1) indices.push(ring[0]!.index, ring[i]!.index, ring[i + 1]!.index);
  }
  return weld({ positions, indices }, 1e-7);
}

// --- deformers -------------------------------------------------------------------------

const otherAxes = (axis: AxisName): [number, number] => {
  const a = AXES[axis];
  return [(a + 1) % 3, (a + 2) % 3];
};

function mapVertices(soup: Soup, fn: (p: Vec3) => Vec3): Soup {
  const positions: number[] = [];
  for (let i = 0; i < soup.positions.length; i += 3) positions.push(...fn(pointAt(soup.positions, i / 3)));
  return { positions, indices: soup.indices };
}

/** Refines the mesh so a deformer has vertices to move. */
function refineForDeform(soup: Soup): Soup {
  const box = bounds(soup.positions);
  const longest = Math.max(box.max[0]! - box.min[0]!, box.max[1]! - box.min[1]!, box.max[2]! - box.min[2]!);
  if (!(longest > 1e-9)) return soup;
  return tessellate(soup, longest / 18, MODEL_MAX_PART_TRIANGLES / 2);
}

export function twistSoup(input: Soup, axis: AxisName, angleDeg: number): Soup {
  const soup = refineForDeform(input);
  const box = bounds(soup.positions);
  const a = AXES[axis];
  const length = box.max[a]! - box.min[a]!;
  if (length < 1e-9) return soup;
  const [u, w] = otherAxes(axis);
  return mapVertices(soup, (p) => {
    const t = (p[a]! - box.min[a]!) / length;
    const theta = (angleDeg * t * Math.PI) / 180;
    const [c, s] = [Math.cos(theta), Math.sin(theta)];
    const out: Vec3 = [...p];
    out[u] = p[u]! * c - p[w]! * s;
    out[w] = p[u]! * s + p[w]! * c;
    return out;
  });
}

export function taperSoup(input: Soup, axis: AxisName, amount: number): Soup {
  const soup = refineForDeform(input);
  const box = bounds(soup.positions);
  const a = AXES[axis];
  const length = box.max[a]! - box.min[a]!;
  if (length < 1e-9) return soup;
  const [u, w] = otherAxes(axis);
  return mapVertices(soup, (p) => {
    const t = (p[a]! - box.min[a]!) / length;
    const s = 1 + (amount - 1) * t;
    const out: Vec3 = [...p];
    out[u] = p[u]! * s;
    out[w] = p[w]! * s;
    return out;
  });
}

/** Bends along `axis` so the shape curves through `angleDeg` — toward +X for Y/Z axes, +Y for the X axis. */
export function bendSoup(input: Soup, axis: AxisName, angleDeg: number): Soup {
  const theta = (angleDeg * Math.PI) / 180;
  if (Math.abs(theta) < 1e-4) return input;
  const soup = refineForDeform(input);
  const box = bounds(soup.positions);
  const a = AXES[axis];
  const d = axis === 'x' ? 1 : 0;
  const length = box.max[a]! - box.min[a]!;
  if (length < 1e-9) return soup;
  const centre = (box.max[a]! + box.min[a]!) / 2;
  const radius = length / theta;
  return mapVertices(soup, (p) => {
    const along = p[a]! - centre;
    const across = p[d]!;
    const phi = along / radius;
    const out: Vec3 = [...p];
    out[a] = centre + (radius - across) * Math.sin(phi);
    out[d] = radius - (radius - across) * Math.cos(phi);
    return out;
  });
}

// --- copies ----------------------------------------------------------------------------------

function mirrorMatrix(axis: AxisName, offset: number): Mat4 {
  const a = AXES[axis];
  const m = identity();
  m[a * 4 + a] = -1;
  m[a * 4 + 3] = 2 * offset;
  return m;
}

export function mirrorSoup(soup: Soup, axis: AxisName, offset: number): Soup {
  const out: Soup = { positions: [...soup.positions], indices: [...soup.indices] };
  appendSoup(out, transformSoup(soup, mirrorMatrix(axis, offset)));
  return out;
}

export function arraySoup(soup: Soup, count: number, offset: Vec3): Soup {
  const out: Soup = { positions: [...soup.positions], indices: [...soup.indices] };
  for (let i = 1; i < count; i += 1) appendSoup(out, transformSoup(soup, translation(v3.scale(offset, i))));
  return out;
}

export function radialArraySoup(soup: Soup, count: number, axis: AxisName, radius: number): Soup {
  const out: Soup = { positions: [], indices: [] };
  const out0: Vec3 = axis === 'x' ? [0, radius, 0] : [radius, 0, 0];
  const base = transformSoup(soup, translation(out0));
  for (let i = 0; i < count; i += 1) {
    const turn = (360 * i) / count;
    const rot: Vec3 = [axis === 'x' ? turn : 0, axis === 'y' ? turn : 0, axis === 'z' ? turn : 0];
    appendSoup(out, transformSoup(base, composeLocal([0, 0, 0], rot, [1, 1, 1])));
  }
  return out;
}

// --- the stack ------------------------------------------------------------------------------------

export type ModifierResult = { soup: Soup; subdivided: boolean; issues: string[] };

/** Runs the enabled modifiers in order over the part's welded geometry; stops (with an issue) at the triangle cap. */
export function applyModifiers(mesh: RawMesh, modifiers: readonly ModelModifier[]): ModifierResult {
  let soup = weld(mesh);
  let subdivided = false;
  const issues: string[] = [];
  for (const [index, modifier] of modifiers.entries()) {
    if (modifier.enabled === false) continue;
    const before = soup;
    switch (modifier.type) {
      case 'bevel':
        soup = bevelSoup(soup, modifier.amount);
        break;
      case 'subdivide':
        for (let level = 0; level < modifier.levels; level += 1) {
          if (triangleCount(soup) * 4 > MODEL_MAX_PART_TRIANGLES) {
            issues.push(`modifiers[${index}]: subdivision stopped at level ${level} — the part would pass ${MODEL_MAX_PART_TRIANGLES} triangles.`);
            break;
          }
          soup = loopSubdivide(soup);
          subdivided = true;
        }
        break;
      case 'mirror':
        soup = mirrorSoup(soup, modifier.axis, modifier.offset);
        break;
      case 'array':
        if (triangleCount(soup) * modifier.count > MODEL_MAX_PART_TRIANGLES) {
          issues.push(`modifiers[${index}]: array skipped — it would pass ${MODEL_MAX_PART_TRIANGLES} triangles.`);
        } else soup = arraySoup(soup, modifier.count, modifier.offset);
        break;
      case 'radialArray':
        if (triangleCount(soup) * modifier.count > MODEL_MAX_PART_TRIANGLES) {
          issues.push(`modifiers[${index}]: radial array skipped — it would pass ${MODEL_MAX_PART_TRIANGLES} triangles.`);
        } else soup = radialArraySoup(soup, modifier.count, modifier.axis, modifier.radius);
        break;
      case 'twist':
        soup = twistSoup(soup, modifier.axis, modifier.angle);
        break;
      case 'taper':
        soup = taperSoup(soup, modifier.axis, modifier.amount);
        break;
      case 'bend':
        soup = bendSoup(soup, modifier.axis, modifier.angle);
        break;
    }
    if (soup.indices.length === 0) soup = before;
  }
  return { soup, subdivided, issues };
}
