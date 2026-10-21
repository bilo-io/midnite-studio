import type { ModelBooleanOp } from '../media-model';
import { v3, type Vec3 } from './math';
import { pointAt, weld, type Soup } from './raw';

/**
 * Boolean solids on triangle meshes: union, subtract and intersect, by BSP-tree clipping (the
 * classic csg.js algorithm). Pure TypeScript with no dependencies, so the **same** code produces
 * the boolean in main (files, previews) and in the renderer (the live editor).
 *
 * Why not `three-bvh-csg`? It is MIT and well maintained, but it works on three `BufferGeometry` —
 * putting three.js (≈730 KB) into the kernel main also imports, and a second geometry
 * implementation back in the renderer. A BSP is slower on very heavy meshes, so operands are
 * bounded ({@link CSG_MAX_TRIANGLES}); inputs must be closed meshes for a meaningful result.
 */

/** Both operands together; heavier inputs are refused with an issue instead of freezing a thread. */
export const CSG_MAX_TRIANGLES = 9000;

const EPS = 1e-5;

type Poly = { verts: Vec3[]; normal: Vec3; w: number };

const flipPoly = (p: Poly): Poly => ({ verts: [...p.verts].reverse(), normal: v3.scale(p.normal, -1), w: -p.w });

function polyFromTriangle(a: Vec3, b: Vec3, c: Vec3): Poly | null {
  const cross = v3.cross(v3.sub(b, a), v3.sub(c, a));
  if (v3.len(cross) < 1e-12) return null;
  const normal = v3.norm(cross);
  return { verts: [a, b, c], normal, w: v3.dot(normal, a) };
}

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

function splitPolygon(plane: { normal: Vec3; w: number }, poly: Poly, coplanarFront: Poly[], coplanarBack: Poly[], front: Poly[], back: Poly[]): void {
  let polygonType = 0;
  const types: number[] = [];
  for (const v of poly.verts) {
    const t = v3.dot(plane.normal, v) - plane.w;
    const type = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    polygonType |= type;
    types.push(type);
  }
  switch (polygonType) {
    case COPLANAR:
      (v3.dot(plane.normal, poly.normal) > 0 ? coplanarFront : coplanarBack).push(poly);
      break;
    case FRONT:
      front.push(poly);
      break;
    case BACK:
      back.push(poly);
      break;
    default: {
      const f: Vec3[] = [];
      const b: Vec3[] = [];
      for (let i = 0; i < poly.verts.length; i += 1) {
        const j = (i + 1) % poly.verts.length;
        const [ti, tj] = [types[i]!, types[j]!];
        const [vi, vj] = [poly.verts[i]!, poly.verts[j]!];
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(vi);
        if ((ti | tj) === SPANNING) {
          const t = (plane.w - v3.dot(plane.normal, vi)) / v3.dot(plane.normal, v3.sub(vj, vi));
          const v = v3.lerp(vi, vj, t);
          f.push(v);
          b.push(v);
        }
      }
      if (f.length >= 3) front.push({ verts: f, normal: poly.normal, w: poly.w });
      if (b.length >= 3) back.push({ verts: b, normal: poly.normal, w: poly.w });
    }
  }
}

class Node {
  plane: { normal: Vec3; w: number } | null = null;
  front: Node | null = null;
  back: Node | null = null;
  polygons: Poly[] = [];

  constructor(polygons?: Poly[]) {
    if (polygons) this.build(polygons);
  }

  invert(): void {
    this.polygons = this.polygons.map(flipPoly);
    if (this.plane) this.plane = { normal: v3.scale(this.plane.normal, -1), w: -this.plane.w };
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }

  clipPolygons(polygons: Poly[]): Poly[] {
    if (!this.plane) return [...polygons];
    let front: Poly[] = [];
    let back: Poly[] = [];
    for (const poly of polygons) splitPolygon(this.plane, poly, front, back, front, back);
    front = this.front ? this.front.clipPolygons(front) : front;
    back = this.back ? this.back.clipPolygons(back) : [];
    return front.concat(back);
  }

  clipTo(bsp: Node): void {
    this.polygons = bsp.clipPolygons(this.polygons);
    this.front?.clipTo(bsp);
    this.back?.clipTo(bsp);
  }

  allPolygons(): Poly[] {
    const out = [...this.polygons];
    if (this.front) out.push(...this.front.allPolygons());
    if (this.back) out.push(...this.back.allPolygons());
    return out;
  }

  build(polygons: Poly[]): void {
    if (polygons.length === 0) return;
    if (!this.plane) {
      // The median-ish polygon makes a steadier tree than always taking the first.
      const pick = polygons[Math.floor(polygons.length / 2)]!;
      this.plane = { normal: pick.normal, w: pick.w };
    }
    const front: Poly[] = [];
    const back: Poly[] = [];
    for (const poly of polygons) splitPolygon(this.plane, poly, this.polygons, this.polygons, front, back);
    if (front.length > 0) {
      this.front ??= new Node();
      this.front.build(front);
    }
    if (back.length > 0) {
      this.back ??= new Node();
      this.back.build(back);
    }
  }
}

function toPolys(soup: Soup): Poly[] {
  const polys: Poly[] = [];
  for (let t = 0; t < soup.indices.length; t += 3) {
    const poly = polyFromTriangle(pointAt(soup.positions, soup.indices[t]!), pointAt(soup.positions, soup.indices[t + 1]!), pointAt(soup.positions, soup.indices[t + 2]!));
    if (poly) polys.push(poly);
  }
  return polys;
}

function toSoup(polys: Poly[]): Soup {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const poly of polys) {
    const base = positions.length / 3;
    for (const v of poly.verts) positions.push(v[0], v[1], v[2]);
    for (let i = 1; i < poly.verts.length - 1; i += 1) indices.push(base, base + i, base + i + 1);
  }
  // Weld the split vertices back together and discard the slivers the clipping leaves.
  return weld({ positions, indices }, 1e-6);
}

export type CsgOutcome = { ok: true; soup: Soup } | { ok: false; reason: string };

/** `a ∘ b` for closed, outward-wound meshes in the same space. */
export function csg(op: ModelBooleanOp, a: Soup, b: Soup): CsgOutcome {
  const total = a.indices.length / 3 + b.indices.length / 3;
  if (total > CSG_MAX_TRIANGLES) {
    return { ok: false, reason: `${total} triangles is over the boolean limit of ${CSG_MAX_TRIANGLES} — lower the shapes' "segments".` };
  }
  const left = new Node(toPolys(a));
  const right = new Node(toPolys(b));
  if (op === 'union') {
    left.clipTo(right);
    right.clipTo(left);
    right.invert();
    right.clipTo(left);
    right.invert();
    left.build(right.allPolygons());
  } else if (op === 'subtract') {
    left.invert();
    left.clipTo(right);
    right.clipTo(left);
    right.invert();
    right.clipTo(left);
    right.invert();
    left.build(right.allPolygons());
    left.invert();
  } else {
    left.invert();
    right.clipTo(left);
    right.invert();
    left.clipTo(right);
    right.clipTo(left);
    left.build(right.allPolygons());
    left.invert();
  }
  const soup = toSoup(left.allPolygons());
  if (soup.indices.length === 0) return { ok: false, reason: `The ${op} left nothing — the shapes do not overlap the way the boolean expects.` };
  return { ok: true, soup };
}
