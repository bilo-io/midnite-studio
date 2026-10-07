import type { OneShotGrid, SpriteBadge, SpriteClip, SpriteFramesFile, SpriteOneShot, SpriteSheetSpec } from '../media-sprite';
import { spriteFrameKey } from '../media-sprite';
import { createRgba, type RgbaImage, type RgbaLike } from './image';

/**
 * Phase 106 Theme F: **grid detection instead of trust.** A one-shot sheet is sliced only along the
 * gutters its pixels actually have.
 *
 * Projection profiles: count the foreground (alpha > {@link GRID_ALPHA}) pixels of every column and
 * every row. A run of near-empty columns at least {@link GRID_MIN_GUTTER} px wide is a gutter; what lies
 * between gutters is a content span. The spans found are compared with the grid that was asked for,
 * and a mismatch is **reported, not forced** — nothing is sliced, rather than re-cut into frames that
 * straddle two poses.
 *
 * The image must already have its background keyed (or carry real alpha): this only reads alpha.
 */
export const GRID_ALPHA = 32;
export const GRID_MIN_GUTTER = 2;
/** A cell this far from the median cell size (either way) gets the `grid` badge. */
export const GRID_OUTLIER = 0.2;

export type Span = [number, number];
export type DetectedGrid = { columns: Span[]; rows: Span[] };

/** Content spans along one axis from a foreground profile. */
export function profileSpans(profile: readonly number[], noise = 0, minGutter = GRID_MIN_GUTTER): Span[] {
  const spans: Span[] = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i <= profile.length; i += 1) {
    const filled = i < profile.length && profile[i]! > noise;
    if (filled) {
      if (start < 0) start = i;
      gap = 0;
      continue;
    }
    if (start < 0) continue;
    gap += 1;
    // A gap narrower than a gutter is part of the span (a 1 px seam inside a sprite).
    if (gap >= minGutter || i === profile.length) {
      const end = i - gap + 1;
      if (end - start >= 2) spans.push([start, end]);
      start = -1;
      gap = 0;
    }
  }
  return spans;
}

/** Column and row content spans of a keyed sheet. */
export function detectGrid(img: RgbaLike): DetectedGrid {
  const { width, height, data } = img;
  const cols = new Array<number>(width).fill(0);
  const rows = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3]! > GRID_ALPHA) {
        cols[x] += 1;
        rows[y] += 1;
      }
    }
  }
  // A handful of stray pixels across a whole column is noise, not content.
  return { columns: profileSpans(cols, Math.floor(height * 0.002)), rows: profileSpans(rows, Math.floor(width * 0.002)) };
}

/** `"Expected 8 × 4 cells, found 7 × 4. Nothing was sliced."`, or `null` when the counts match. */
export function compareGrid(detected: DetectedGrid, grid: Pick<OneShotGrid, 'columns' | 'rows'>): string | null {
  if (detected.columns.length === grid.columns && detected.rows.length === grid.rows) return null;
  return `Expected ${grid.columns} × ${grid.rows} cells, found ${detected.columns.length} × ${detected.rows.length}. Nothing was sliced.`;
}

/** Slice bounds: each span widened to the midpoints of the gutters around it, the outer ones to the edge. */
export function cellBounds(spans: readonly Span[], size: number): Span[] {
  return spans.map((span, i) => {
    const start = i === 0 ? 0 : Math.round((spans[i - 1]![1] + span[0]) / 2);
    const end = i === spans.length - 1 ? size : Math.round((span[1] + spans[i + 1]![0]) / 2);
    return [start, end];
  });
}

/** One cell of the sheet, by slice bounds. */
export function sliceCell(img: RgbaLike, column: Span, row: Span): RgbaImage {
  const w = column[1] - column[0];
  const h = row[1] - row[0];
  const out = createRgba(w, h);
  for (let y = 0; y < h; y += 1) {
    const from = ((row[0] + y) * img.width + column[0]) * 4;
    for (let k = 0; k < w * 4; k += 1) out.data[y * w * 4 + k] = img.data[from + k]!;
  }
  return out;
}

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Indices of spans more than {@link GRID_OUTLIER} off the median span length. */
export function outlierSpans(spans: readonly Span[]): Set<number> {
  const sizes = spans.map(([a, b]) => b - a);
  const mid = median(sizes);
  return new Set(sizes.flatMap((s, i) => (mid > 0 && Math.abs(s - mid) > GRID_OUTLIER * mid ? [i] : [])));
}

// --- the verdict ------------------------------------------------------------------

export type SpriteOneShotRowVerdict = { clip: string; dir: string; ok: boolean; summary: string };
export type SpriteOneShotVerdict = {
  /** Set when grid detection found another grid than the one asked for: nothing was sliced. */
  sheet: string | null;
  rows: SpriteOneShotRowVerdict[];
};

const BADGE_WORDS: Partial<Record<SpriteBadge, string>> = {
  empty: 'empty',
  clipped: 'clipped',
  height: 'off height',
  drift: 'drifting off the anchor',
  grid: 'off the grid',
  inconsistent: 'inconsistent',
};

/**
 * Per row: `"row 3, attack: 2 of 6 frames clipped"` (the most common problem), `"… frames missing"`
 * when frames were never written, or `"row 1, idle: 4 frames ok"`. Built from `sprite.json`'s
 * `oneShot.rows` and the frame badges, so it needs no extra file and survives a reload.
 */
export function oneShotVerdict(spec: Pick<SpriteSheetSpec, 'clips' | 'directions'> & { oneShot?: SpriteOneShot | undefined }, frames: SpriteFramesFile): SpriteOneShotVerdict | null {
  const shot = spec.oneShot;
  if (!shot) return null;
  if (shot.mismatch) return { sheet: shot.mismatch, rows: [] };
  const multi = spec.directions > 1;
  const rows = shot.rows.map(({ clip: name, dir }, i): SpriteOneShotRowVerdict => {
    const clip: SpriteClip | undefined = spec.clips.find((c) => c.name === name);
    const count = clip?.frames ?? 0;
    const label = `row ${i + 1}, ${name}${multi ? ` (${dir})` : ''}`;
    let missing = 0;
    const tally = new Map<SpriteBadge, number>();
    for (let n = 0; n < count; n += 1) {
      const meta = frames.frames[spriteFrameKey(name, dir, n)];
      if (!meta) {
        missing += 1;
        continue;
      }
      for (const badge of new Set(meta.badges)) if (BADGE_WORDS[badge]) tally.set(badge, (tally.get(badge) ?? 0) + 1);
    }
    if (missing > 0) return { clip: name, dir, ok: false, summary: `${label}: ${missing} of ${count} frames missing` };
    const worst = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!worst) return { clip: name, dir, ok: true, summary: `${label}: ${count} ${count === 1 ? 'frame' : 'frames'} ok` };
    return { clip: name, dir, ok: false, summary: `${label}: ${worst[1]} of ${count} frames ${BADGE_WORDS[worst[0]]}` };
  });
  return { sheet: null, rows };
}
