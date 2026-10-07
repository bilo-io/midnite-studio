import { z } from 'zod';

import { valueNoise } from '../sdf/evaluate';
import { falloffWeight, SCULPT_FALLOFFS, type SculptFalloff } from '../sculpt/brush';
import { clonePaintImage, createPaintImage, sampleBilinear, type PaintImage } from './image';
import type { PaintSurface } from './surface';

/**
 * Paint brushes (Phase 104 Theme G): **brush**, **eraser**, **fill**, **smudge**, **clone** and **stamp**,
 * applied to one RGBA layer image through a {@link PaintSurface}.
 *
 * A dab is a sphere on the surface (centre, radius, in mesh units). The BVH gives the triangles it can reach;
 * each is walked texel by texel through the surface's texel map, so a dab paints every chart it touches in 3D
 * — across a uv seam both sides get paint, and gutter texels (extrapolated) get it too. A texel's weight is
 * the falloff at its surface point's distance from the centre, times strength and pressure, and zero when its
 * normal faces away from the viewer (front faces only).
 *
 * Every op composites in straight alpha: the brush lays `color` over what is there ("over"), the eraser takes
 * coverage away, smudge drags the colour it picked up along the stroke, clone copies the image from an offset
 * point on the surface (read from a snapshot taken when the stroke began, so it never copies its own paint),
 * stamp lays the colour through an alpha image projected flat onto the dab, and fill floods the uv chart under
 * the hit at full strength.
 */
export const PAINT_BRUSHES = ['brush', 'eraser', 'fill', 'smudge', 'clone', 'stamp'] as const;
export type PaintBrushKind = (typeof PAINT_BRUSHES)[number];
export const STAMP_PATTERNS = ['dots', 'noise', 'scratches'] as const;
export type StampPattern = (typeof STAMP_PATTERNS)[number];

type V3 = [number, number, number];

export const PaintBrushSchema = z.object({
  brush: z.enum(PAINT_BRUSHES),
  /** Dab radius in mesh units. */
  radius: z.number().positive().max(1000),
  strength: z.number().min(0).max(1),
  falloff: z.enum(SCULPT_FALLOFFS).default('smooth'),
  /** Distance between dabs along a stroke, as a fraction of the radius. */
  spacing: z.number().min(0.02).max(2).default(0.15),
  frontFacesOnly: z.boolean().optional(),
});
export type PaintBrush = z.infer<typeof PaintBrushSchema>;

/** What a stroke lays down and how (beyond the dab geometry). */
export type PaintStrokeOptions = PaintBrush & {
  /** The value painted, 0–1 per component (a scalar channel repeats it). */
  color: readonly [number, number, number];
  /** Clone: source = texel point + this offset (mesh units). */
  cloneOffset?: V3;
  /** Stamp: the alpha image (its luminance × alpha is the stamp). */
  stamp?: PaintImage;
  /** Stamp: rotation of the image about the dab's normal, degrees. */
  stampAngle?: number;
};

/** Inclusive texel bounds of what changed. */
export type DirtyRect = { x0: number; y0: number; x1: number; y1: number };

export const unionRect = (a: DirtyRect | null, b: DirtyRect | null): DirtyRect | null =>
  !a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };

/** Before a dab writes a rect: the history's chance to save those pixels. */
export type BeforeWrite = (rect: DirtyRect) => void;

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (a: readonly number[]): V3 => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

/** Straight-alpha "over": `rgb` at alpha `a` onto texel `at`. */
function over(data: Uint8Array, at: number, rgb: readonly number[], a: number): void {
  const da = data[at + 3]! / 255;
  const outA = a + da * (1 - a);
  if (outA <= 0) return;
  for (let k = 0; k < 3; k += 1) {
    const dst = data[at + k]! / 255;
    data[at + k] = Math.round(((rgb[k]! * a + dst * da * (1 - a)) / outA) * 255);
  }
  data[at + 3] = Math.round(outA * 255);
}

/** Visits every texel a dab reaches with its weight; returns the rect it covered. */
function forEachTexel(
  surface: PaintSurface,
  size: number,
  dab: { center: V3; radius: number; view?: V3 | undefined; frontFacesOnly?: boolean | undefined },
  weightOf: (d: number) => number,
  visit: (at: number, weight: number, point: number[], normal: number[], x: number, y: number) => void,
): DirtyRect | null {
  const map = surface.texelMap(size);
  const triangles = surface.bvh.trianglesNearSphere(dab.center, dab.radius);
  const bary = [0, 0, 0];
  const point = [0, 0, 0];
  const normal = [0, 0, 0];
  const pad = 4;
  let rect: DirtyRect | null = null;
  const r2 = dab.radius * dab.radius;
  for (const t of triangles) {
    const i0 = surface.indices[t * 3]!;
    const i1 = surface.indices[t * 3 + 1]!;
    const i2 = surface.indices[t * 3 + 2]!;
    const us = [surface.uvs[i0 * 2]!, surface.uvs[i1 * 2]!, surface.uvs[i2 * 2]!];
    const vs = [surface.uvs[i0 * 2 + 1]!, surface.uvs[i1 * 2 + 1]!, surface.uvs[i2 * 2 + 1]!];
    const x0 = Math.max(0, Math.floor(Math.min(...us) * size) - pad);
    const x1 = Math.min(size - 1, Math.ceil(Math.max(...us) * size) + pad);
    const y0 = Math.max(0, Math.floor(Math.min(...vs) * size) - pad);
    const y1 = Math.min(size - 1, Math.ceil(Math.max(...vs) * size) + pad);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const texel = y * size + x;
        if (map.triangle[texel] !== t) continue;
        surface.barycentric(t, size, x, y, bary);
        surface.interpolate(surface.positions, t, bary, point);
        const dx = point[0]! - dab.center[0];
        const dy = point[1]! - dab.center[1];
        const dz = point[2]! - dab.center[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) continue;
        surface.interpolate(surface.normals, t, bary, normal);
        if (dab.frontFacesOnly && dab.view && dot(normal, dab.view) > 0) continue;
        const weight = weightOf(Math.sqrt(d2) / dab.radius);
        if (weight <= 0) continue;
        rect = unionRect(rect, { x0: x, y0: y, x1: x, y1: y });
        visit(texel * 4, weight, point, normal, x, y);
      }
    }
  }
  return rect;
}

/** The rect a dab can touch (for saving history before it writes), conservatively. */
function dabBounds(surface: PaintSurface, size: number, center: V3, radius: number): DirtyRect | null {
  const triangles = surface.bvh.trianglesNearSphere(center, radius);
  let rect: DirtyRect | null = null;
  for (const t of triangles) {
    for (let k = 0; k < 3; k += 1) {
      const v = surface.indices[t * 3 + k]!;
      const x = Math.floor(surface.uvs[v * 2]! * size);
      const y = Math.floor(surface.uvs[v * 2 + 1]! * size);
      rect = unionRect(rect, { x0: Math.max(0, x - 5), y0: Math.max(0, y - 5), x1: Math.min(size - 1, x + 5), y1: Math.min(size - 1, y + 5) });
    }
  }
  return rect;
}

/**
 * A stroke on one layer image: dabs spaced along the path, the per-stroke state smudge and clone need, and
 * the changed rect. `beforeWrite` lets a history save pixels before the first write to them.
 */
export class PaintStroke {
  private last: V3 | null = null;
  private carried: number[] | null = null;
  private readonly source: PaintImage | null;
  private rect: DirtyRect | null = null;
  dabs = 0;
  texels = 0;

  constructor(
    private readonly surface: PaintSurface,
    private readonly image: PaintImage,
    readonly options: PaintStrokeOptions,
    private readonly beforeWrite?: BeforeWrite,
  ) {
    this.source = options.brush === 'clone' ? clonePaintImage(image) : null;
  }

  get changed(): DirtyRect | null {
    return this.rect;
  }

  /** Lifts the brush: the next point starts a fresh run (no dabs bridging the gap). */
  break(): void {
    this.last = null;
  }

  /** Moves the brush to `point` (on the surface), dabbing every `spacing × radius` along the way. */
  to(point: V3, view: V3 | undefined, pressure = 1): void {
    if (this.options.brush === 'fill') {
      this.fillAt(point);
      return;
    }
    const step = Math.max(1e-9, this.options.spacing * this.options.radius);
    if (!this.last) {
      this.dab(point, view, pressure);
      this.last = point;
      return;
    }
    const from = this.last;
    const delta = sub(point, from);
    const distance = Math.hypot(delta[0], delta[1], delta[2]);
    if (distance < step) return;
    const n = Math.floor(distance / step);
    for (let k = 1; k <= n; k += 1) {
      const t = (k * step) / distance;
      this.dab([from[0] + delta[0] * t, from[1] + delta[1] * t, from[2] + delta[2] * t], view, pressure);
    }
    const t = (n * step) / distance;
    this.last = [from[0] + delta[0] * t, from[1] + delta[1] * t, from[2] + delta[2] * t];
  }

  private note(rect: DirtyRect | null): void {
    this.rect = unionRect(this.rect, rect);
  }

  /** One dab at `center`. */
  dab(center: V3, view: V3 | undefined, pressure = 1): void {
    const o = this.options;
    const size = this.image.width;
    const data = this.image.data;
    const strength = o.strength * pressure;
    if (strength <= 0) return;
    const bounds = dabBounds(this.surface, size, center, o.radius);
    if (!bounds) return;
    this.beforeWrite?.(bounds);
    const dab = { center, radius: o.radius, view, frontFacesOnly: o.frontFacesOnly };
    const weightOf = (d: number) => falloffWeight(o.falloff as SculptFalloff, d) * strength;
    let written = 0;
    let rect: DirtyRect | null = null;

    if (o.brush === 'brush') {
      rect = forEachTexel(this.surface, size, dab, weightOf, (at, w) => {
        over(data, at, o.color, Math.min(1, w));
        written += 1;
      });
    } else if (o.brush === 'eraser') {
      rect = forEachTexel(this.surface, size, dab, weightOf, (at, w) => {
        data[at + 3] = Math.round(data[at + 3]! * (1 - Math.min(1, w)));
        written += 1;
      });
    } else if (o.brush === 'smudge') {
      // Pick up what is under the dab (coverage-weighted), then lay the carried colour down.
      const sum = [0, 0, 0, 0];
      let weights = 0;
      forEachTexel(this.surface, size, dab, (d) => falloffWeight(o.falloff as SculptFalloff, d), (at, w) => {
        const a = data[at + 3]! / 255;
        for (let k = 0; k < 3; k += 1) sum[k]! += (data[at + k]! / 255) * a * w;
        sum[3]! += a * w;
        weights += w;
      });
      const picked = weights > 0 ? [sum[3]! > 0 ? sum[0]! / sum[3]! : 0, sum[3]! > 0 ? sum[1]! / sum[3]! : 0, sum[3]! > 0 ? sum[2]! / sum[3]! : 0, sum[3]! / weights] : null;
      if (this.carried && picked) {
        const carried = this.carried;
        rect = forEachTexel(this.surface, size, dab, weightOf, (at, w) => {
          const a = Math.min(1, w);
          for (let k = 0; k < 3; k += 1) data[at + k] = Math.round((data[at + k]! / 255 + (carried[k]! - data[at + k]! / 255) * a) * 255);
          data[at + 3] = Math.round((data[at + 3]! / 255 + (carried[3]! - data[at + 3]! / 255) * a) * 255);
          written += 1;
        });
      }
      if (picked) this.carried = this.carried ? this.carried.map((c, k) => c + (picked[k]! - c) * 0.35) : picked;
    } else if (o.brush === 'clone') {
      const offset = o.cloneOffset ?? [0, 0, 0];
      const source = this.source!;
      const px = [0, 0, 0, 0];
      rect = forEachTexel(this.surface, size, dab, weightOf, (_at, w, point) => {
        const from = this.surface.closest([point[0]! + offset[0], point[1]! + offset[1], point[2]! + offset[2]], o.radius * 4 + Math.hypot(...offset));
        if (!from) return;
        sampleBilinear(source, from.uv[0], from.uv[1], px);
        over(data, _at, px, Math.min(1, w) * px[3]!);
        written += 1;
      });
    } else if (o.brush === 'stamp') {
      // The stamp lies flat on the dab, facing the viewer (or along the surface normal with no view).
      const normal = view ? unit([-view[0], -view[1], -view[2]]) : this.normalAt(center);
      const helper: V3 = Math.abs(normal[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
      let tangent = unit(cross(helper, normal));
      let bitangent = cross(normal, tangent);
      const angle = ((o.stampAngle ?? 0) * Math.PI) / 180;
      if (angle !== 0) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const t2: V3 = [tangent[0] * c + bitangent[0] * s, tangent[1] * c + bitangent[1] * s, tangent[2] * c + bitangent[2] * s];
        bitangent = cross(normal, t2);
        tangent = t2;
      }
      const stamp = o.stamp ?? stampPattern('dots', 64);
      const px = [0, 0, 0, 0];
      rect = forEachTexel(this.surface, size, dab, () => strength, (at, w, point) => {
        const rel = sub(point, center);
        const su = (dot(rel, tangent) / o.radius) * 0.5 + 0.5;
        const sv = 0.5 - (dot(rel, bitangent) / o.radius) * 0.5;
        if (su < 0 || su > 1 || sv < 0 || sv > 1) return;
        sampleBilinear(stamp, su, sv, px);
        const alpha = (0.2126 * px[0]! + 0.7152 * px[1]! + 0.0722 * px[2]!) * px[3]!;
        if (alpha <= 0) return;
        over(data, at, o.color, Math.min(1, w * alpha));
        written += 1;
      });
    }
    this.dabs += 1;
    this.texels += written;
    this.note(rect);
  }

  private normalAt(point: V3): V3 {
    const hit = this.surface.bvh.closestPoint(point);
    if (!hit) return [0, 0, 1];
    return unit(this.surface.interpolate(this.surface.normals, hit.triangle, hit.barycentric));
  }

  /** Floods the uv chart under `point` with the colour at the stroke's strength (gutter included). */
  fillAt(point: V3): void {
    const hit = this.surface.closest(point);
    if (!hit) return;
    const chart = this.surface.charts[hit.triangle]!;
    const size = this.image.width;
    const map = this.surface.texelMap(size);
    let rect: DirtyRect | null = null;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const t = map.triangle[y * size + x]!;
        if (t >= 0 && this.surface.charts[t] === chart) rect = unionRect(rect, { x0: x, y0: y, x1: x, y1: y });
      }
    }
    if (!rect) return;
    this.beforeWrite?.(rect);
    let written = 0;
    for (let y = rect.y0; y <= rect.y1; y += 1) {
      for (let x = rect.x0; x <= rect.x1; x += 1) {
        const t = map.triangle[y * size + x]!;
        if (t < 0 || this.surface.charts[t] !== chart) continue;
        over(this.image.data, (y * size + x) * 4, this.options.color, this.options.strength);
        written += 1;
      }
    }
    this.dabs += 1;
    this.texels += written;
    this.note(rect);
  }
}

/** A built-in stamp: a grey alpha image at `size`. */
export function stampPattern(pattern: StampPattern, size = 64): PaintImage {
  const image = createPaintImage(size);
  const put = (x: number, y: number, v: number) => {
    const at = (y * size + x) * 4;
    const g = Math.round(Math.min(1, Math.max(0, v)) * 255);
    image.data[at] = g;
    image.data[at + 1] = g;
    image.data[at + 2] = g;
    image.data[at + 3] = 255;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const edge = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2);
      let value = 0;
      if (pattern === 'dots') {
        const cu = (u * 4) % 1;
        const cv = (v * 4) % 1;
        value = Math.hypot(cu - 0.5, cv - 0.5) < 0.28 ? 1 : 0;
      } else if (pattern === 'noise') {
        value = (valueNoise(u * 9, v * 9, 0.5, 7) * 0.5 + 0.5) * 1.2 - 0.2;
      } else {
        // Thin diagonal scratches.
        const s = valueNoise(u * 2, v * 40, 1.5, 11);
        value = Math.abs(s) < 0.06 ? 1 : 0;
      }
      put(x, y, value * Math.min(1, edge * 3));
    }
  }
  return image;
}
