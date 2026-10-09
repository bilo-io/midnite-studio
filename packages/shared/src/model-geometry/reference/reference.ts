import type { ReferenceView } from '../../media-model-reference';
import { CAMERA_DIRECTIONS, type PreviewCamera } from '../camera';
import type { Vec3 } from '../math';
import type { MeshPart } from '../scene';

/**
 * Silhouette and proportion scores against a reference picture (Phase 104 Theme H).
 *
 * The agent's own eyes are good at "that looks wrong" and poor at "the shoulders are 12 % too wide". This module
 * gives it numbers. A model is rasterised to a binary mask *in the reference picture's own pixel frame* (through the
 * matched view's scale and offset), the picture is segmented to a mask of the same size, and the two are compared:
 * IoU for the overall silhouette, and a width profile along the up axis for *where* they differ.
 *
 * Pure typed-array maths, no clock and no randomness, so identical inputs score identically and a vitest can pin it.
 */

export type Mask = { width: number; height: number; data: Uint8Array };

const unit = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The orthographic camera a matched view describes, in the picture's pixel frame. */
export function referenceCamera(view: Pick<ReferenceView, 'view' | 'scale' | 'offset'>, width: number): PreviewCamera {
  const { forward, up: upHint } = CAMERA_DIRECTIONS[view.view];
  const right = unit(cross(forward, upHint));
  const up = cross(right, forward);
  return { view: view.view, size: width, forward, right, up, scale: view.scale, offsetX: view.offset[0], offsetY: view.offset[1], extent: 0, near: -1e9 };
}

/** A binary mask of the parts seen through `camera`, `width × height` pixels. */
export function rasterizeMask(parts: readonly Pick<MeshPart, 'positions' | 'indices'>[], camera: PreviewCamera, width: number, height: number): Mask {
  const data = new Uint8Array(width * height);
  const { right, up, scale, offsetX, offsetY } = camera;
  for (const part of parts) {
    const count = part.positions.length / 3;
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const px = part.positions[i * 3]!;
      const py = part.positions[i * 3 + 1]!;
      const pz = part.positions[i * 3 + 2]!;
      xs[i] = (px * right[0] + py * right[1] + pz * right[2]) * scale + offsetX;
      ys[i] = offsetY - (px * up[0] + py * up[1] + pz * up[2]) * scale;
    }
    for (let t = 0; t < part.indices.length; t += 3) {
      const a = part.indices[t]!;
      const b = part.indices[t + 1]!;
      const c = part.indices[t + 2]!;
      fillTriangle(data, width, height, xs[a]!, ys[a]!, xs[b]!, ys[b]!, xs[c]!, ys[c]!);
    }
  }
  return { width, height, data };
}

/** Fills the pixels whose centres fall inside the triangle (either winding). */
function fillTriangle(data: Uint8Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) - 0.5));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2) - 0.5));
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) - 0.5));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2) - 0.5));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-9) return;
  const inv = 1 / area;
  for (let y = minY; y <= maxY; y += 1) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const w1 = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) * inv;
      const w2 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) * inv;
      if (w1 >= -1e-6 && w2 >= -1e-6 && w1 + w2 <= 1 + 1e-6) data[y * width + x] = 1;
    }
  }
}

export type SegmentOptions = {
  /** Colour distance (0–441) from the background that counts as the subject; default 48. */
  threshold?: number;
  /** Treat the dark/lit side the other way round: subject = what is *close* to the background colour. */
  invert?: boolean;
};

/**
 * The subject of a picture as a mask. A picture with real transparency uses its alpha; otherwise the background is
 * the median colour of the picture's border, and the subject is whatever differs from it by more than `threshold`.
 * Simple on purpose: a studio-lit reference on a plain ground segments cleanly, and the overlay image makes a bad
 * segmentation obvious, which is the cue to supply a cut-out.
 */
export function segmentSilhouette(rgba: Uint8Array, width: number, height: number, options: SegmentOptions = {}): Mask {
  const data = new Uint8Array(width * height);
  const n = width * height;
  let transparent = 0;
  for (let i = 0; i < n; i += 1) if (rgba[i * 4 + 3]! < 250) transparent += 1;
  if (transparent > n * 0.01) {
    for (let i = 0; i < n; i += 1) data[i] = rgba[i * 4 + 3]! > 128 ? 1 : 0;
    return { width, height, data };
  }
  const border: number[][] = [[], [], []];
  const take = (x: number, y: number): void => {
    const o = (y * width + x) * 4;
    for (let c = 0; c < 3; c += 1) border[c]!.push(rgba[o + c]!);
  };
  for (let x = 0; x < width; x += 1) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    take(0, y);
    take(width - 1, y);
  }
  const bg = border.map((values) => {
    values.sort((a, b) => a - b);
    return values[values.length >> 1] ?? 0;
  });
  const threshold = options.threshold ?? 48;
  for (let i = 0; i < n; i += 1) {
    const dr = rgba[i * 4]! - bg[0]!;
    const dg = rgba[i * 4 + 1]! - bg[1]!;
    const db = rgba[i * 4 + 2]! - bg[2]!;
    const far = Math.hypot(dr, dg, db) > threshold;
    data[i] = far !== !!options.invert ? 1 : 0;
  }
  return { width, height, data };
}

/** Intersection over union of two same-sized masks; two empty masks agree perfectly. */
export function silhouetteIou(a: Mask, b: Mask): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error('masks differ in size');
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.data.length; i += 1) {
    const x = a.data[i]!;
    const y = b.data[i]!;
    if (x && y) both += 1;
    if (x || y) either += 1;
  }
  return either === 0 ? 1 : both / either;
}

/** Rows (inclusive) that hold any subject, or `null` for an empty mask. */
export function maskRows(mask: Mask): { top: number; bottom: number } | null {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < mask.height; y += 1) {
    let any = false;
    for (let x = 0; x < mask.width && !any; x += 1) any = mask.data[y * mask.width + x] === 1;
    if (any) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return top < 0 ? null : { top, bottom };
}

/** Mean subject pixels per row for rows `[from, to)`. */
function meanWidth(mask: Mask, from: number, to: number): number {
  let sum = 0;
  let rows = 0;
  for (let y = Math.max(0, from); y < Math.min(mask.height, to); y += 1) {
    let w = 0;
    for (let x = 0; x < mask.width; x += 1) w += mask.data[y * mask.width + x]!;
    sum += w;
    rows += 1;
  }
  return rows === 0 ? 0 : sum / rows;
}

export type ProfileBand = {
  /** The band's rows in picture pixels, `[from, to)`. */
  rows: [number, number];
  /** The band's vertical span in model units along the view's up axis. */
  up: [number, number];
  /** Mean width, in model units. */
  reference: number;
  model: number;
  /** `model / reference`; 0 when the model has nothing there. */
  ratio: number;
};

/** Width profile along the picture's vertical axis, in `bands` equal slices of the *reference's* extent. */
export function widthProfile(reference: Mask, model: Mask, camera: Pick<PreviewCamera, 'scale' | 'offsetY'>, bands = 12): ProfileBand[] {
  const rows = maskRows(reference);
  if (!rows) return [];
  const span = rows.bottom - rows.top + 1;
  const out: ProfileBand[] = [];
  for (let i = 0; i < bands; i += 1) {
    const from = Math.round(rows.top + (span * i) / bands);
    const to = Math.max(from + 1, Math.round(rows.top + (span * (i + 1)) / bands));
    const r = meanWidth(reference, from, to) / camera.scale;
    const m = meanWidth(model, from, to) / camera.scale;
    out.push({
      rows: [from, to],
      up: [(camera.offsetY - to) / camera.scale, (camera.offsetY - from) / camera.scale],
      reference: r,
      model: m,
      ratio: r > 0 ? m / r : m > 0 ? Infinity : 1,
    });
  }
  return out;
}

export type RegionVerdict = 'too wide' | 'too narrow' | 'missing' | 'extra';

export type RegionFinding = {
  /** The span along the up axis, in model units (`[low, high]`). */
  up: [number, number];
  /** Share of the reference's height from its top, `[0, 1]`. */
  fraction: [number, number];
  verdict: RegionVerdict;
  /** model width / reference width, averaged over the region (`null` when the reference is empty there). */
  ratio: number | null;
  /** The correction, in words an agent can act on. */
  advice: string;
};

export type HeightFinding = { verdict: 'too tall' | 'too short'; model: number; reference: number; delta: number; advice: string } | null;

const label = (n: number): string => (Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2));

/** Merges runs of bands with the same verdict into regions, with a sentence for each. */
export function profileFindings(bands: readonly ProfileBand[], tolerance = 0.12): RegionFinding[] {
  const out: RegionFinding[] = [];
  const total = bands.length;
  let run: { from: number; to: number; verdict: RegionVerdict; ratios: number[] } | null = null;
  const flush = (): void => {
    if (!run) return;
    const lo = bands[run.to]!.up[0];
    const hi = bands[run.from]!.up[1];
    const finite = run.ratios.filter((r) => Number.isFinite(r));
    const ratio = finite.length ? finite.reduce((s, r) => s + r, 0) / finite.length : null;
    const where = `y ${label(lo)} to ${label(hi)}`;
    const verb =
      run.verdict === 'too wide'
        ? `narrow it${ratio ? ` by about ${Math.round((1 - 1 / ratio) * 100)} %` : ''}`
        : run.verdict === 'too narrow'
          ? `widen it${ratio ? ` by about ${Math.round((1 / Math.max(ratio, 0.05) - 1) * 100)} %` : ''}`
          : run.verdict === 'missing'
            ? 'add volume there'
            : 'remove what sticks out there';
    out.push({ up: [lo, hi], fraction: [run.from / total, (run.to + 1) / total], verdict: run.verdict, ratio, advice: `${where} is ${run.verdict} — ${verb}.` });
    run = null;
  };
  bands.forEach((band, i) => {
    let verdict: RegionVerdict | null = null;
    if (band.reference <= 0 && band.model > 0) verdict = 'extra';
    else if (band.reference > 0 && band.model <= 0) verdict = 'missing';
    else if (band.ratio > 1 + tolerance) verdict = 'too wide';
    else if (band.ratio < 1 - tolerance) verdict = 'too narrow';
    if (run && run.verdict === verdict) {
      run.to = i;
      run.ratios.push(band.ratio);
      return;
    }
    flush();
    if (verdict) run = { from: i, to: i, verdict, ratios: [band.ratio] };
  });
  flush();
  return out;
}

/** Compares the two silhouettes' heights. */
export function heightFinding(reference: Mask, model: Mask, scale: number, tolerance = 0.04): HeightFinding {
  const r = maskRows(reference);
  const m = maskRows(model);
  if (!r) return null;
  const refH = (r.bottom - r.top + 1) / scale;
  const modelH = m ? (m.bottom - m.top + 1) / scale : 0;
  const ratio = modelH / refH;
  if (Math.abs(ratio - 1) <= tolerance) return null;
  const delta = modelH - refH;
  const tall = delta > 0;
  return {
    verdict: tall ? 'too tall' : 'too short',
    model: modelH,
    reference: refH,
    delta,
    advice: `The model is ${label(Math.abs(delta))} m ${tall ? 'taller' : 'shorter'} than the reference (${label(modelH)} vs ${label(refH)} m) — ${tall ? 'lower' : 'raise'} its top or scale it.`,
  };
}

/** Mean of `min(ratio, 1/ratio)` over the bands that matter: 1 for a perfect match, 0 for nothing alike. */
export function profileScore(bands: readonly ProfileBand[]): number {
  let sum = 0;
  let n = 0;
  for (const band of bands) {
    if (band.reference <= 0 && band.model <= 0) continue;
    n += 1;
    if (band.reference <= 0 || band.model <= 0) continue;
    sum += Math.min(band.ratio, 1 / band.ratio);
  }
  return n === 0 ? 1 : sum / n;
}

export type ViewScore = {
  view: ReferenceView['view'];
  /** Silhouette IoU, 0–1. */
  iou: number;
  /** Width-profile agreement, 0–1. */
  profile: number;
  /** `0.6 × iou + 0.4 × profile`. */
  score: number;
  height: HeightFinding;
  regions: RegionFinding[];
  bands: ProfileBand[];
};

/** The agreement of one model mask and one reference mask in the same frame. */
export function scoreView(view: ReferenceView['view'], reference: Mask, model: Mask, camera: Pick<PreviewCamera, 'scale' | 'offsetY'>, tolerance = 0.12): ViewScore {
  const iou = silhouetteIou(reference, model);
  const bands = widthProfile(reference, model, camera);
  const profile = profileScore(bands);
  return {
    view,
    iou,
    profile,
    score: 0.6 * iou + 0.4 * profile,
    height: heightFinding(reference, model, camera.scale),
    regions: profileFindings(bands, tolerance),
    bands,
  };
}

/** Mean of the per-view scores — the number a loop tracks. */
export const overallScore = (views: readonly Pick<ViewScore, 'score'>[]): number => (views.length === 0 ? 0 : views.reduce((s, v) => s + v.score, 0) / views.length);

/** RGBA overlay: reference only in red, model only in blue, both dark grey, on white. */
export function overlayMasks(reference: Mask, model: Mask): { width: number; height: number; data: Uint8Array } {
  const out = new Uint8Array(reference.width * reference.height * 4);
  for (let i = 0; i < reference.data.length; i += 1) {
    const r = reference.data[i]!;
    const m = model.data[i]!;
    const rgb = r && m ? [96, 96, 104] : r ? [226, 84, 84] : m ? [74, 118, 230] : [250, 250, 250];
    out[i * 4] = rgb[0]!;
    out[i * 4 + 1] = rgb[1]!;
    out[i * 4 + 2] = rgb[2]!;
    out[i * 4 + 3] = 255;
  }
  return { width: reference.width, height: reference.height, data: out };
}

/**
 * Registers a reference picture to a model of known height: the subject's rows become `height` model units tall with
 * its feet (or the bottom of its silhouette) at `bottom`, and its columns are centred on the model's origin. This is
 * the matched view an agent would otherwise have to work out with a ruler.
 */
export function fitReferenceView(mask: Mask, view: ReferenceView['view'], height: number, bottom = 0): Pick<ReferenceView, 'view' | 'scale' | 'offset'> | null {
  const rows = maskRows(mask);
  if (!rows || height <= 0) return null;
  let left = mask.width;
  let right = -1;
  for (let y = rows.top; y <= rows.bottom; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x]) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  const scale = (rows.bottom - rows.top + 1) / height;
  return { view, scale, offset: [(left + right + 1) / 2, rows.bottom + 1 + bottom * scale] };
}
