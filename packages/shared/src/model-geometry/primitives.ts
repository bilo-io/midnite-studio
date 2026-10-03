import type { ModelPart } from '../media-model';
import { v3, type Vec3 } from './math';
import {
  dropDegenerate,
  emptyMesh,
  isClosed,
  orient,
  pushVertex,
  signedArea2D,
  smoothNormals,
  triangulatePolygon,
  type RawMesh,
  type Soup,
} from './raw';

/**
 * Every shape a part can be, as a mesh in the part's own space (origin at its position, before
 * modifiers and the transform). Closed shapes come out **closed, outward-wound (CCW) and with
 * normals**: each is built and then passed through `orient`, which flips a part whose signed volume
 * is negative, so an LLM that lists a lathe profile top to bottom or an outline clockwise still
 * gets a correctly lit solid.
 */

const TAU = Math.PI * 2;
export const DEFAULT_SEGMENTS = 32;

/**
 * A `(rows+1) × (cols+1)` parametric grid; `u` runs along rows, `v` along columns. Triangles are
 * `(a, b, c), (b, d, c)` — wound along `∂u × ∂v` — and `flip` reverses them for a parametrisation
 * whose `∂u × ∂v` points inward.
 */
function pushGrid(raw: RawMesh, rows: number, cols: number, at: (u: number, v: number) => { p: Vec3; n: Vec3 }, flip = false): void {
  const base = raw.positions.length / 3;
  for (let i = 0; i <= rows; i += 1) {
    for (let j = 0; j <= cols; j += 1) {
      const { p, n } = at(i / rows, j / cols);
      pushVertex(raw, p, n);
    }
  }
  const stride = cols + 1;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const a = base + i * stride + j;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      if (flip) raw.indices.push(a, c, b, b, c, d);
      else raw.indices.push(a, b, c, b, d, c);
    }
  }
}

/** A flat disc / fan at height `y`, `up` = +1 faces +Y. */
function pushDisc(raw: RawMesh, radius: number, y: number, up: 1 | -1, seg: number): void {
  const centre = pushVertex(raw, [0, y, 0], [0, up, 0]);
  const ring: number[] = [];
  for (let i = 0; i <= seg; i += 1) {
    const angle = (i / seg) * TAU;
    ring.push(pushVertex(raw, [Math.cos(angle) * radius, y, Math.sin(angle) * radius], [0, up, 0]));
  }
  for (let i = 0; i < seg; i += 1) {
    if (up === 1) raw.indices.push(centre, ring[i + 1]!, ring[i]!);
    else raw.indices.push(centre, ring[i]!, ring[i + 1]!);
  }
}

export function buildBox(size: Vec3): RawMesh {
  const raw = emptyMesh();
  const half: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const X: Vec3 = [1, 0, 0];
  const Y: Vec3 = [0, 1, 0];
  const Z: Vec3 = [0, 0, 1];
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  // n, u, v with u × v = n, so the corner order below is CCW seen from outside.
  const faces: [Vec3, Vec3, Vec3][] = [
    [X, Y, Z],
    [neg(X), Z, Y],
    [Y, Z, X],
    [neg(Y), X, Z],
    [Z, X, Y],
    [neg(Z), Y, X],
  ];
  const extent = (axis: Vec3): number => Math.abs(axis[0]) * half[0] + Math.abs(axis[1]) * half[1] + Math.abs(axis[2]) * half[2];
  for (const [n, u, v] of faces) {
    const centre: Vec3 = [n[0] * extent(n), n[1] * extent(n), n[2] * extent(n)];
    const hu = extent(u);
    const hv = extent(v);
    const corner = (su: number, sv: number): Vec3 => [
      centre[0] + u[0] * hu * su + v[0] * hv * sv,
      centre[1] + u[1] * hu * su + v[1] * hv * sv,
      centre[2] + u[2] * hu * su + v[2] * hv * sv,
    ];
    const a = pushVertex(raw, corner(-1, -1), n);
    const b = pushVertex(raw, corner(1, -1), n);
    const c = pushVertex(raw, corner(1, 1), n);
    const d = pushVertex(raw, corner(-1, 1), n);
    raw.indices.push(a, b, c, a, c, d);
  }
  return raw;
}

export function buildSphere(radius: number, seg = DEFAULT_SEGMENTS): RawMesh {
  const raw = emptyMesh();
  const rings = Math.max(3, Math.round(seg * 0.625));
  pushGrid(
    raw,
    rings,
    seg,
    (u, v) => {
      const theta = u * Math.PI;
      const phi = v * TAU;
      const n: Vec3 = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      return { p: [n[0] * radius, n[1] * radius, n[2] * radius], n };
    },
    true,
  );
  return raw;
}

/** Centred on the origin along Y, like three.js's `CylinderGeometry`. */
export function buildCylinder(radiusTop: number, radiusBottom: number, height: number, seg = DEFAULT_SEGMENTS): RawMesh {
  const raw = emptyMesh();
  const slope = (radiusBottom - radiusTop) / height;
  pushGrid(raw, 1, seg, (u, v) => {
    const phi = v * TAU;
    const radius = radiusBottom + (radiusTop - radiusBottom) * u;
    return {
      p: [Math.cos(phi) * radius, -height / 2 + height * u, Math.sin(phi) * radius],
      n: [Math.cos(phi), slope, Math.sin(phi)],
    };
  });
  if (radiusTop > 1e-9) pushDisc(raw, radiusTop, height / 2, 1, seg);
  if (radiusBottom > 1e-9) pushDisc(raw, radiusBottom, -height / 2, -1, seg);
  return raw;
}

export function buildTorus(radius: number, tube: number, seg = DEFAULT_SEGMENTS): RawMesh {
  const raw = emptyMesh();
  pushGrid(
    raw,
    seg,
    Math.max(6, Math.round(seg / 2)),
    (u, v) => {
      const around = u * TAU;
      const turn = v * TAU;
      const n: Vec3 = [Math.cos(turn) * Math.cos(around), Math.sin(turn), Math.cos(turn) * Math.sin(around)];
      const ring = radius + tube * Math.cos(turn);
      return { p: [ring * Math.cos(around), tube * Math.sin(turn), ring * Math.sin(around)], n };
    },
    true,
  );
  return raw;
}

/** A `[radius, y]` profile revolved about Y, capped flat where it ends off-axis. */
export function buildLathe(profile: readonly (readonly [number, number])[], seg = DEFAULT_SEGMENTS): RawMesh {
  const raw = emptyMesh();
  const last = profile.length - 1;
  // Per-point normal in the (r, y) plane: the profile tangent turned 90°, averaged across the joint.
  const profileNormal = (i: number): [number, number] => {
    const prev = profile[Math.max(i - 1, 0)]!;
    const next = profile[Math.min(i + 1, last)]!;
    const dr = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dr, dy);
    return len < 1e-12 ? [1, 0] : [dy / len, -dr / len];
  };
  pushGrid(raw, last, seg, (u, v) => {
    const i = Math.min(Math.round(u * last), last);
    const [r, y] = profile[i]!;
    const [nr, ny] = profileNormal(i);
    const phi = v * TAU;
    return { p: [Math.cos(phi) * r, y, Math.sin(phi) * r], n: [Math.cos(phi) * nr, ny, Math.sin(phi) * nr] };
  });
  const [firstR, firstY] = profile[0]!;
  const [lastR, lastY] = profile[last]!;
  if (firstR > 1e-9) pushDisc(raw, firstR, firstY, firstY <= lastY ? -1 : 1, seg);
  if (lastR > 1e-9) pushDisc(raw, lastR, lastY, firstY <= lastY ? 1 : -1, seg);
  return raw;
}

/** An `[x, z]` outline extruded from y=0 to `height`. */
export function buildExtrude(outline: readonly (readonly [number, number])[], height: number): RawMesh {
  const raw = emptyMesh();
  const ccw = signedArea2D(outline) >= 0 ? outline : [...outline].reverse();
  const tris = triangulatePolygon(ccw);
  for (const [y, up] of [
    [height, 1],
    [0, -1],
  ] as const) {
    const base = raw.positions.length / 3;
    for (const [x, z] of ccw) pushVertex(raw, [x, y, z], [0, up, 0]);
    for (const [a, b, c] of tris) {
      // In x-z a CCW polygon looks clockwise from +Y, so the top reverses it.
      if (up === 1) raw.indices.push(base + a, base + c, base + b);
      else raw.indices.push(base + a, base + b, base + c);
    }
  }
  for (let i = 0; i < ccw.length; i += 1) {
    const [x1, z1] = ccw[i]!;
    const [x2, z2] = ccw[(i + 1) % ccw.length]!;
    const edge: Vec3 = [x2 - x1, 0, z2 - z1];
    // A CCW-in-(x,z) outline has its interior on the +z-ish side of each edge, so out is Y × edge.
    const n = v3.norm(v3.cross([0, 1, 0], edge));
    const a = pushVertex(raw, [x1, 0, z1], n);
    const b = pushVertex(raw, [x2, 0, z2], n);
    const c = pushVertex(raw, [x2, height, z2], n);
    const d = pushVertex(raw, [x1, height, z1], n);
    raw.indices.push(a, c, b, a, d, c);
  }
  return raw;
}

/** A cylinder with hemispherical ends, as a revolved profile (so its normals are exact). */
function buildCapsule(radius: number, height: number, seg: number): RawMesh {
  const k = Math.max(2, Math.round(seg / 4));
  const profile: [number, number][] = [];
  for (let i = 0; i <= k; i += 1) {
    const theta = -Math.PI / 2 + (i / k) * (Math.PI / 2);
    profile.push([i === 0 ? 0 : Math.cos(theta) * radius, -height / 2 + Math.sin(theta) * radius]);
  }
  for (let i = 0; i <= k; i += 1) {
    const theta = (i / k) * (Math.PI / 2);
    profile.push([i === k ? 0 : Math.cos(theta) * radius, height / 2 + Math.sin(theta) * radius]);
  }
  return buildLathe(profile, seg);
}

/** A box with every edge rounded: a cube-sphere clamp — grid points cluster in the corner zones. */
function buildRoundedBox(size: Vec3, radiusIn: number, seg: number): RawMesh {
  const half: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const radius = Math.min(radiusIn, Math.min(half[0], half[1], half[2]));
  if (radius < 1e-9) return buildBox(size);
  const k = Math.max(2, Math.round(seg / 4));
  /** Coordinates along one axis: `k+1` points through each rounded end, the flat middle left as one span. */
  const ticks = (h: number): number[] => {
    const inner = h - radius;
    const out: number[] = [];
    for (let i = 0; i <= k; i += 1) out.push(-h + (radius * i) / k);
    for (let i = 0; i <= k; i += 1) out.push(inner + (radius * i) / k);
    return out;
  };
  const raw = emptyMesh();
  const X: Vec3 = [1, 0, 0];
  const Y: Vec3 = [0, 1, 0];
  const Z: Vec3 = [0, 0, 1];
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  const faces: [Vec3, Vec3, Vec3][] = [
    [X, Y, Z],
    [neg(X), Z, Y],
    [Y, Z, X],
    [neg(Y), X, Z],
    [Z, X, Y],
    [neg(Z), Y, X],
  ];
  const comp = (v: Vec3, axisVec: Vec3): number => Math.abs(axisVec[0]) * v[0] + Math.abs(axisVec[1]) * v[1] + Math.abs(axisVec[2]) * v[2];
  for (const [n, u, v] of faces) {
    const hn = comp(half, n);
    const hu = comp(half, u);
    const hv = comp(half, v);
    const us = ticks(hu);
    const vs = ticks(hv);
    const base = raw.positions.length / 3;
    for (const a of us) {
      for (const b of vs) {
        // The point on the (unrounded) box face, clamped into the inner box, then pushed out by `radius`.
        const q: Vec3 = [
          n[0] * hn + u[0] * a + v[0] * b,
          n[1] * hn + u[1] * a + v[1] * b,
          n[2] * hn + u[2] * a + v[2] * b,
        ];
        const clamp = (value: number, h: number): number => Math.max(-(h - radius), Math.min(h - radius, value));
        const c: Vec3 = [clamp(q[0], half[0]), clamp(q[1], half[1]), clamp(q[2], half[2])];
        const dir = v3.norm(v3.sub(q, c), n);
        pushVertex(raw, v3.add(c, v3.scale(dir, radius)), dir);
      }
    }
    const stride = vs.length;
    for (let i = 0; i < us.length - 1; i += 1) {
      for (let j = 0; j < vs.length - 1; j += 1) {
        const a = base + i * stride + j;
        const b = a + stride;
        const c = a + 1;
        const d = b + 1;
        raw.indices.push(a, b, d, a, d, c);
      }
    }
  }
  return raw;
}

/** A right-triangle cross-section (z, y) extruded along X, via the extrude builder + a cyclic axis permutation. */
function buildWedge(size: Vec3): RawMesh {
  const [sx, sy, sz] = size;
  // Outline in (x', z') = (z, y): high at -Z, ground level at +Z.
  const outline: [number, number][] = [
    [-sz / 2, -sy / 2],
    [sz / 2, -sy / 2],
    [-sz / 2, sy / 2],
  ];
  const e = buildExtrude(outline, sx);
  // (x', y', z') → world (X = y' - sx/2, Y = z', Z = x'): a cyclic permutation, so handedness is kept.
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < e.positions.length; i += 3) {
    positions.push(e.positions[i + 1]! - sx / 2, e.positions[i + 2]!, e.positions[i]!);
    normals.push(e.normals[i + 1]!, e.normals[i + 2]!, e.normals[i]!);
  }
  return { positions, normals, indices: e.indices };
}

function buildPrism(radius: number, height: number, sides: number): RawMesh {
  const outline: [number, number][] = [];
  for (let i = 0; i < sides; i += 1) outline.push([Math.cos((i / sides) * TAU) * radius, Math.sin((i / sides) * TAU) * radius]);
  const e = buildExtrude(outline, height);
  for (let i = 1; i < e.positions.length; i += 3) e.positions[i] = e.positions[i]! - height / 2;
  return e;
}

function buildEllipsoid(radii: Vec3, seg: number): RawMesh {
  const sphere = buildSphere(1, seg);
  for (let i = 0; i < sphere.positions.length; i += 3) {
    const n: Vec3 = [sphere.normals[i]! / radii[0], sphere.normals[i + 1]! / radii[1], sphere.normals[i + 2]! / radii[2]];
    sphere.positions[i] = sphere.positions[i]! * radii[0];
    sphere.positions[i + 1] = sphere.positions[i + 1]! * radii[1];
    sphere.positions[i + 2] = sphere.positions[i + 2]! * radii[2];
    const unit = v3.norm(n);
    sphere.normals[i] = unit[0];
    sphere.normals[i + 1] = unit[1];
    sphere.normals[i + 2] = unit[2];
  }
  return sphere;
}

// --- paths, sweeps, lofts --------------------------------------------------------

const MAX_PATH_SAMPLES = 400;

/** Catmull-Rom through `points` (a polyline when `spline` is false or there are two points). */
export function samplePath(points: readonly Vec3[], closed: boolean, spline: boolean): Vec3[] {
  const n = points.length;
  if (!spline || n < 3) return points.map((p) => [...p] as Vec3);
  const perSegment = Math.max(2, Math.min(12, Math.floor(MAX_PATH_SAMPLES / n)));
  const at = (i: number): Vec3 => (closed ? points[((i % n) + n) % n]! : points[Math.max(0, Math.min(n - 1, i))]!);
  const segments = closed ? n : n - 1;
  const out: Vec3[] = [];
  for (let s = 0; s < segments; s += 1) {
    const p0 = at(s - 1);
    const p1 = at(s);
    const p2 = at(s + 1);
    const p3 = at(s + 2);
    for (let k = 0; k < perSegment; k += 1) {
      const t = k / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  if (!closed) out.push([...points[n - 1]!] as Vec3);
  return out;
}

/** Rotation-minimising frames along a polyline: parallel transport of an initial normal. */
function pathFrames(path: readonly Vec3[], closed: boolean): { t: Vec3; n: Vec3; b: Vec3 }[] {
  const count = path.length;
  const tangents: Vec3[] = path.map((p, i) => {
    const prev = closed ? path[(i + count - 1) % count]! : path[Math.max(0, i - 1)]!;
    const next = closed ? path[(i + 1) % count]! : path[Math.min(count - 1, i + 1)]!;
    return v3.norm(v3.sub(next, prev), [0, 1, 0]);
  });
  const t0 = tangents[0]!;
  const helper: Vec3 = Math.abs(t0[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let n = v3.norm(v3.cross(helper, t0), [1, 0, 0]);
  return tangents.map((t) => {
    // Remove the part of the carried normal along the new tangent.
    n = v3.norm(v3.sub(n, v3.scale(t, v3.dot(n, t))), n);
    return { t, n, b: v3.cross(t, n) };
  });
}

/** Skin `profile` (a 2-D polygon) along `path`. Sides are wound outward; open paths get flat caps. */
function sweepProfile(
  profileIn: readonly (readonly [number, number])[],
  path: readonly Vec3[],
  options: { closed: boolean; scaleAt: (t: number) => number; twistDeg: number },
): Soup {
  const profile = signedArea2D(profileIn) >= 0 ? profileIn : [...profileIn].reverse();
  const frames = pathFrames(path, options.closed);
  const rows = path.length;
  const cols = profile.length;
  const positions: number[] = [];
  const total = options.closed ? rows : rows - 1;
  for (let i = 0; i < rows; i += 1) {
    const t = total === 0 ? 0 : i / total;
    const s = options.scaleAt(t);
    const twist = (options.twistDeg * t * Math.PI) / 180;
    const [cos, sin] = [Math.cos(twist), Math.sin(twist)];
    const { n, b } = frames[i]!;
    for (const [px, py] of profile) {
      const x = (px * cos - py * sin) * s;
      const y = (px * sin + py * cos) * s;
      positions.push(
        path[i]![0] + n[0] * x + b[0] * y,
        path[i]![1] + n[1] * x + b[1] * y,
        path[i]![2] + n[2] * x + b[2] * y,
      );
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < total; i += 1) {
    const next = (i + 1) % rows;
    for (let j = 0; j < cols; j += 1) {
      const jn = (j + 1) % cols;
      const a = i * cols + j;
      const b = next * cols + j;
      const c = i * cols + jn;
      const d = next * cols + jn;
      // CCW profile about +T: (a, c, b) winds outward.
      indices.push(a, c, b, b, c, d);
    }
  }
  if (!options.closed) {
    const tris = triangulatePolygon(profile);
    for (const [a, b, c] of tris) {
      indices.push(c, b, a); // start cap faces -T
      const o = (rows - 1) * cols;
      indices.push(o + a, o + b, o + c); // end cap faces +T
    }
  }
  return { positions, indices };
}

/** Bring each outline to `count` points by splitting the longest edges — corners are kept. */
function resampleOutline(outline: readonly (readonly [number, number])[], count: number): [number, number][] {
  const pts: [number, number][] = (signedArea2D(outline) >= 0 ? outline : [...outline].reverse()).map((p) => [p[0], p[1]]);
  while (pts.length < count) {
    let at = 0;
    let longest = -1;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > longest) {
        longest = len;
        at = i;
      }
    }
    const a = pts[at]!;
    const b = pts[(at + 1) % pts.length]!;
    pts.splice(at + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return pts;
}

function buildLoft(sectionsIn: readonly { y: number; outline: readonly (readonly [number, number])[] }[]): Soup {
  const sections = [...sectionsIn].sort((a, b) => a.y - b.y);
  const count = Math.max(...sections.map((s) => s.outline.length));
  const rings = sections.map((s) => resampleOutline(s.outline, count));
  const positions: number[] = [];
  for (const [r, ring] of rings.entries()) for (const [x, z] of ring) positions.push(x, sections[r]!.y, z);
  const indices: number[] = [];
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let j = 0; j < count; j += 1) {
      const jn = (j + 1) % count;
      const a = r * count + j;
      const b = (r + 1) * count + j;
      const c = r * count + jn;
      const d = (r + 1) * count + jn;
      indices.push(a, b, c, b, d, c);
    }
  }
  const tris = triangulatePolygon(rings[0]!);
  const top = (rings.length - 1) * count;
  for (const [a, b, c] of tris) {
    indices.push(a, b, c); // bottom faces -Y
    indices.push(top + a, top + c, top + b); // top faces +Y
  }
  return { positions, indices };
}

function buildCustomMesh(vertices: readonly Vec3[], faces: readonly (readonly number[])[]): Soup {
  const positions: number[] = [];
  for (const v of vertices) positions.push(v[0], v[1], v[2]);
  const indices: number[] = [];
  for (const face of faces) {
    if (face.some((i) => i < 0 || i >= vertices.length)) continue;
    indices.push(face[0]!, face[1]!, face[2]!);
    if (face.length === 4) indices.push(face[0]!, face[2]!, face[3]!);
  }
  return { positions, indices };
}

/** Default normal smoothing for shapes that are built as a plain triangle soup. */
export const SOUP_SMOOTH_ANGLE = 40;

/**
 * The part's own geometry, before modifiers and its transform; `null` for a transform-only node
 * (`group`, `instance`). `analytic` meshes carry exact normals; soups need {@link smoothNormals}.
 */
export function buildLocalMesh(part: ModelPart): RawMesh | null {
  const seg = part.segments ?? DEFAULT_SEGMENTS;
  const finish = (raw: RawMesh): RawMesh => dropDegenerate(orient(raw));
  const fromSoup = (soup: Soup): RawMesh => finish(smoothNormals(soup, part.smoothAngle ?? SOUP_SMOOTH_ANGLE));
  switch (part.shape) {
    case 'box':
      return finish(buildBox(part.size));
    case 'sphere':
      return finish(buildSphere(part.radius, seg));
    case 'cylinder':
      return finish(buildCylinder(part.radiusTop, part.radiusBottom, part.height, seg));
    case 'cone':
      return finish(buildCylinder(0, part.radius, part.height, seg));
    case 'torus':
      return finish(buildTorus(part.radius, part.tube, seg));
    case 'lathe':
      return finish(buildLathe(part.profile, seg));
    case 'extrude':
      return finish(buildExtrude(part.outline, part.height));
    case 'capsule':
      return finish(buildCapsule(part.radius, part.height, seg));
    case 'roundedBox':
      return finish(buildRoundedBox(part.size, part.radius, seg));
    case 'wedge':
      return finish(buildWedge(part.size));
    case 'prism':
      return finish(buildPrism(part.radius, part.height, part.sides));
    case 'ellipsoid':
      return finish(buildEllipsoid(part.radii, seg));
    case 'tube': {
      const path = samplePath(part.path, part.closed === true, part.spline);
      const circle: [number, number][] = Array.from({ length: Math.max(3, Math.min(seg, 24)) }, (_, i) => [
        Math.cos((i / Math.max(3, Math.min(seg, 24))) * TAU),
        Math.sin((i / Math.max(3, Math.min(seg, 24))) * TAU),
      ]);
      const end = part.radiusEnd ?? part.radius;
      return fromSoup(
        sweepProfile(circle, path, { closed: part.closed === true, scaleAt: (t) => part.radius + (end - part.radius) * t, twistDeg: 0 }),
      );
    }
    case 'sweep': {
      const path = samplePath(part.path, part.closed === true, part.spline);
      const scaleEnd = part.scaleEnd ?? 1;
      return fromSoup(
        sweepProfile(part.profile, path, { closed: part.closed === true, scaleAt: (t) => 1 + (scaleEnd - 1) * t, twistDeg: part.twist ?? 0 }),
      );
    }
    case 'loft':
      return fromSoup(buildLoft(part.sections));
    case 'mesh': {
      const soup = buildCustomMesh(part.vertices, part.faces);
      const smooth = smoothNormals(soup, part.smoothAngle ?? SOUP_SMOOTH_ANGLE);
      return dropDegenerate(isClosed(smooth) ? orient(smooth) : smooth);
    }
    case 'group':
    case 'instance':
      return null;
  }
}

