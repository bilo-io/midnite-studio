import type { ModelPart, ModelSpec } from '@midnite/studio-shared';

/**
 * Pure geometry for Media ▸ Models: turns a validated `ModelSpec` into
 * triangle meshes in world space. No three.js, no Electron — main owns the
 * mesh so the `.obj`/`.fbx` writers (and their tests) need nothing else.
 *
 * Every part comes out **closed, outward-wound (CCW) and with normals**:
 * each primitive is built then passed through `orient`, which flips a part
 * whose signed volume is negative, so an LLM that lists a lathe profile top
 * to bottom or an outline clockwise still gets a correctly lit solid.
 */

export type MeshPart = {
  name: string;
  /** `#rrggbb`, lower-case. */
  color: string;
  /** xyz triples, world space. */
  positions: number[];
  /** xyz triples, unit length, one per position. */
  normals: number[];
  /** Triangle corner indices into `positions`/3. */
  indices: number[];
};

type Raw = { positions: number[]; normals: number[]; indices: number[] };

const TAU = Math.PI * 2;
const RADIAL_SEGMENTS = 32;
const SPHERE_RINGS = 20;
const TORUS_TUBE_SEGMENTS = 16;
const TORUS_RADIAL_SEGMENTS = 32;

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v: Vec): Vec => {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len < 1e-12 ? [0, 1, 0] : [v[0] / len, v[1] / len, v[2] / len];
};

/** Shared writer for one vertex. */
function pushVertex(raw: Raw, p: Vec, n: Vec): number {
  raw.positions.push(p[0], p[1], p[2]);
  const unit = normalize(n);
  raw.normals.push(unit[0], unit[1], unit[2]);
  return raw.positions.length / 3 - 1;
}

/**
 * A `(rows+1) × (cols+1)` parametric grid; `u` runs along rows, `v` along
 * columns. Triangles are `(a, b, c), (b, d, c)` — wound along `∂u × ∂v` — and
 * `flip` reverses them for a parametrisation whose `∂u × ∂v` points inward.
 */
function pushGrid(
  raw: Raw,
  rows: number,
  cols: number,
  at: (u: number, v: number) => { p: Vec; n: Vec },
  flip = false,
): void {
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
function pushDisc(raw: Raw, radius: number, y: number, up: 1 | -1): void {
  const centre = pushVertex(raw, [0, y, 0], [0, up, 0]);
  const ring: number[] = [];
  for (let i = 0; i <= RADIAL_SEGMENTS; i += 1) {
    const angle = (i / RADIAL_SEGMENTS) * TAU;
    ring.push(pushVertex(raw, [Math.cos(angle) * radius, y, Math.sin(angle) * radius], [0, up, 0]));
  }
  for (let i = 0; i < RADIAL_SEGMENTS; i += 1) {
    if (up === 1) raw.indices.push(centre, ring[i + 1]!, ring[i]!);
    else raw.indices.push(centre, ring[i]!, ring[i + 1]!);
  }
}

function buildBox(size: [number, number, number]): Raw {
  const raw: Raw = { positions: [], normals: [], indices: [] };
  const half: Vec = [size[0] / 2, size[1] / 2, size[2] / 2];
  const X: Vec = [1, 0, 0];
  const Y: Vec = [0, 1, 0];
  const Z: Vec = [0, 0, 1];
  const neg = (v: Vec): Vec => [-v[0], -v[1], -v[2]];
  // n, u, v with u × v = n, so the corner order below is CCW seen from outside.
  const faces: [Vec, Vec, Vec][] = [
    [X, Y, Z],
    [neg(X), Z, Y],
    [Y, Z, X],
    [neg(Y), X, Z],
    [Z, X, Y],
    [neg(Z), Y, X],
  ];
  const extent = (axis: Vec): number => Math.abs(axis[0]) * half[0] + Math.abs(axis[1]) * half[1] + Math.abs(axis[2]) * half[2];
  for (const [n, u, v] of faces) {
    const centre: Vec = [n[0] * extent(n), n[1] * extent(n), n[2] * extent(n)];
    const hu = extent(u);
    const hv = extent(v);
    const corner = (su: number, sv: number): Vec => [
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

function buildSphere(radius: number): Raw {
  const raw: Raw = { positions: [], normals: [], indices: [] };
  pushGrid(raw, SPHERE_RINGS, RADIAL_SEGMENTS, (u, v) => {
    const theta = u * Math.PI;
    const phi = v * TAU;
    const n: Vec = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
    return { p: [n[0] * radius, n[1] * radius, n[2] * radius], n };
  }, true);
  return raw;
}

/** Centred on the origin along Y, like three.js's `CylinderGeometry`. */
function buildCylinder(radiusTop: number, radiusBottom: number, height: number): Raw {
  const raw: Raw = { positions: [], normals: [], indices: [] };
  const slope = (radiusBottom - radiusTop) / height;
  pushGrid(raw, 1, RADIAL_SEGMENTS, (u, v) => {
    const phi = v * TAU;
    const radius = radiusBottom + (radiusTop - radiusBottom) * u;
    return {
      p: [Math.cos(phi) * radius, -height / 2 + height * u, Math.sin(phi) * radius],
      n: [Math.cos(phi), slope, Math.sin(phi)],
    };
  });
  if (radiusTop > 1e-9) pushDisc(raw, radiusTop, height / 2, 1);
  if (radiusBottom > 1e-9) pushDisc(raw, radiusBottom, -height / 2, -1);
  return raw;
}

function buildTorus(radius: number, tube: number): Raw {
  const raw: Raw = { positions: [], normals: [], indices: [] };
  pushGrid(raw, TORUS_RADIAL_SEGMENTS, TORUS_TUBE_SEGMENTS, (u, v) => {
    const around = u * TAU;
    const turn = v * TAU;
    const n: Vec = [Math.cos(turn) * Math.cos(around), Math.sin(turn), Math.cos(turn) * Math.sin(around)];
    const ring = radius + tube * Math.cos(turn);
    return { p: [ring * Math.cos(around), tube * Math.sin(turn), ring * Math.sin(around)], n };
  }, true);
  return raw;
}

/** A `[radius, y]` profile revolved about Y, capped flat where it ends off-axis. */
function buildLathe(profile: [number, number][]): Raw {
  const raw: Raw = { positions: [], normals: [], indices: [] };
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
  pushGrid(raw, last, RADIAL_SEGMENTS, (u, v) => {
    const i = Math.min(Math.round(u * last), last);
    const [r, y] = profile[i]!;
    const [nr, ny] = profileNormal(i);
    const phi = v * TAU;
    return { p: [Math.cos(phi) * r, y, Math.sin(phi) * r], n: [Math.cos(phi) * nr, ny, Math.sin(phi) * nr] };
  });
  const [firstR, firstY] = profile[0]!;
  const [lastR, lastY] = profile[last]!;
  if (firstR > 1e-9) pushDisc(raw, firstR, firstY, firstY <= lastY ? -1 : 1);
  if (lastR > 1e-9) pushDisc(raw, lastR, lastY, firstY <= lastY ? 1 : -1);
  return raw;
}

const signedArea2D = (poly: [number, number][]): number => {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
};

/** Ear-clipping triangulation of a simple polygon; returns index triples into `poly`. */
export function triangulatePolygon(poly: [number, number][]): [number, number, number][] {
  const n = poly.length;
  const order = Array.from({ length: n }, (_, i) => i);
  if (signedArea2D(poly) < 0) order.reverse();
  const cross2 = (o: number, a: number, b: number): number => {
    const po = poly[o]!;
    const pa = poly[a]!;
    const pb = poly[b]!;
    return (pa[0] - po[0]) * (pb[1] - po[1]) - (pa[1] - po[1]) * (pb[0] - po[0]);
  };
  const inside = (p: number, a: number, b: number, c: number): boolean =>
    cross2(a, b, p) >= 0 && cross2(b, c, p) >= 0 && cross2(c, a, p) >= 0;
  const tris: [number, number, number][] = [];
  let guard = n * n;
  while (order.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < order.length; i += 1) {
      const a = order[(i + order.length - 1) % order.length]!;
      const b = order[i]!;
      const c = order[(i + 1) % order.length]!;
      if (cross2(a, b, c) <= 1e-12) continue;
      const blocked = order.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c));
      if (blocked) continue;
      tris.push([a, b, c]);
      order.splice(i, 1);
      clipped = true;
      break;
    }
    // A degenerate / self-intersecting outline: drop the first vertex rather than loop forever.
    if (!clipped) order.shift();
  }
  if (order.length === 3) tris.push([order[0]!, order[1]!, order[2]!]);
  return tris;
}

/** An `[x, z]` outline extruded from y=0 to `height`. */
function buildExtrude(outline: [number, number][], height: number): Raw {
  const raw: Raw = { positions: [], normals: [], indices: [] };
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
    const edge: Vec = [x2 - x1, 0, z2 - z1];
    // A CCW-in-(x,z) outline has its interior on the +z-ish side of each edge, so out is Y × edge.
    const n = normalize(cross([0, 1, 0], edge));
    const a = pushVertex(raw, [x1, 0, z1], n);
    const b = pushVertex(raw, [x2, 0, z2], n);
    const c = pushVertex(raw, [x2, height, z2], n);
    const d = pushVertex(raw, [x1, height, z1], n);
    raw.indices.push(a, c, b, a, d, c);
  }
  return raw;
}

/** Six times the signed volume of a closed triangle mesh — positive when wound CCW outward. */
export function signedVolume(positions: readonly number[], indices: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const o = [indices[i]! * 3, indices[i + 1]! * 3, indices[i + 2]! * 3] as const;
    const a: Vec = [positions[o[0]]!, positions[o[0] + 1]!, positions[o[0] + 2]!];
    const b: Vec = [positions[o[1]]!, positions[o[1] + 1]!, positions[o[1] + 2]!];
    const c: Vec = [positions[o[2]]!, positions[o[2] + 1]!, positions[o[2] + 2]!];
    sum += dot(a, cross(b, c));
  }
  return sum / 6;
}

/**
 * Safety net for a part that still came out inside-out (a lathe profile listed
 * top to bottom): swap two corners of every triangle and negate the normals.
 * Winding and normals of those shapes derive from the same profile direction,
 * so they are always wrong together and flipped together.
 */
function orient(raw: Raw): Raw {
  if (signedVolume(raw.positions, raw.indices) >= 0) return raw;
  for (let i = 0; i < raw.indices.length; i += 3) {
    const tmp = raw.indices[i + 1]!;
    raw.indices[i + 1] = raw.indices[i + 2]!;
    raw.indices[i + 2] = tmp;
  }
  raw.normals = raw.normals.map((value) => -value);
  return raw;
}

/** Drop zero-area triangles (cone apex, lathe poles) that would only confuse importers. */
function dropDegenerate(raw: Raw): Raw {
  const kept: number[] = [];
  for (let i = 0; i < raw.indices.length; i += 3) {
    const [a, b, c] = [raw.indices[i]! * 3, raw.indices[i + 1]! * 3, raw.indices[i + 2]! * 3];
    const pa: Vec = [raw.positions[a]!, raw.positions[a + 1]!, raw.positions[a + 2]!];
    const pb: Vec = [raw.positions[b]!, raw.positions[b + 1]!, raw.positions[b + 2]!];
    const pc: Vec = [raw.positions[c]!, raw.positions[c + 1]!, raw.positions[c + 2]!];
    const area = cross(sub(pb, pa), sub(pc, pa));
    if (Math.hypot(area[0], area[1], area[2]) > 1e-12) kept.push(raw.indices[i]!, raw.indices[i + 1]!, raw.indices[i + 2]!);
  }
  return { ...raw, indices: kept };
}

function buildLocal(part: ModelPart): Raw {
  switch (part.shape) {
    case 'box':
      return buildBox(part.size);
    case 'sphere':
      return buildSphere(part.radius);
    case 'cylinder':
      return buildCylinder(part.radiusTop, part.radiusBottom, part.height);
    case 'cone':
      return buildCylinder(0, part.radius, part.height);
    case 'torus':
      return buildTorus(part.radius, part.tube);
    case 'lathe':
      return buildLathe(part.profile);
    case 'extrude':
      return buildExtrude(part.outline, part.height);
  }
}

/** Euler XYZ in degrees → row-major 3×3, matching three.js `Euler(x, y, z, 'XYZ')` (`R = Rx·Ry·Rz`). */
export function rotationMatrix(degrees: Vec): number[] {
  const [x, y, z] = degrees.map((d) => (d * Math.PI) / 180) as Vec;
  const [a, b] = [Math.cos(x), Math.sin(x)];
  const [c, d] = [Math.cos(y), Math.sin(y)];
  const [e, f] = [Math.cos(z), Math.sin(z)];
  return [c * e, -c * f, d, b * d * e + a * f, -b * d * f + a * e, -b * c, -a * d * e + b * f, a * d * f + b * e, a * c];
}

const apply = (m: number[], v: Vec): Vec => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
];

const hex = (color: string): string => {
  const body = color.slice(1).toLowerCase();
  return `#${body.length === 3 ? [...body].map((ch) => ch + ch).join('') : body}`;
};

/** One part, scaled → rotated → translated into world space. */
export function buildPart(part: ModelPart): MeshPart {
  const local = dropDegenerate(orient(buildLocal(part)));
  const rotation = rotationMatrix(part.rotation);
  const [sx, sy, sz] = part.scale;
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < local.positions.length; i += 3) {
    const p: Vec = [local.positions[i]! * sx, local.positions[i + 1]! * sy, local.positions[i + 2]! * sz];
    const world = apply(rotation, p);
    positions.push(world[0] + part.position[0], world[1] + part.position[1], world[2] + part.position[2]);
    // Normals take the inverse-transpose of the scale (1/s), then the rotation.
    const n: Vec = [local.normals[i]! / sx, local.normals[i + 1]! / sy, local.normals[i + 2]! / sz];
    normals.push(...normalize(apply(rotation, n)));
  }
  return { name: part.name, color: hex(part.color), positions, normals, indices: local.indices };
}

export function buildScene(spec: ModelSpec): MeshPart[] {
  return spec.parts.map(buildPart);
}

/** World-space bounds of a scene, for the sidecar and the camera framing tests. */
export function sceneBounds(parts: readonly MeshPart[]): { min: Vec; max: Vec } {
  const min: Vec = [Infinity, Infinity, Infinity];
  const max: Vec = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = part.positions[i + axis]!;
        if (value < min[axis]!) min[axis] = value;
        if (value > max[axis]!) max[axis] = value;
      }
    }
  }
  return { min, max };
}
