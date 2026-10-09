import {
  cellBounds,
  compareGrid,
  detectGrid,
  handDrawnDirections,
  handDrawnProvider,
  hasPartialAlpha,
  keyChroma,
  ONE_SHOT_PROMPT_VERSION,
  oneShotAspect,
  oneShotBlocker,
  oneShotGrid,
  oneShotPrompt,
  oneShotRows,
  outlierSpans,
  sliceCell,
  spriteBackgroundRequest,
  spriteFrameKey,
  spriteReferenceFrame,
  type GitOpResult,
  type RgbaImage,
  type SpriteAssetSpec,
  type SpriteFrameMeta,
  type SpriteGenerateRequest,
} from '@midnite/studio-shared';

import type { ImageBytesRequest } from '../image/image-service';
import type { GeneratedImage } from '../image/types';
import { encodePngRgba8 } from '../png/png-codec';
import { decodeFrame, type FrameTranscode } from './frame-pipeline';
import type { SpriteJobRunner } from './sprite-service';

/**
 * Phase 106 Theme F: the one-shot frame source. The whole sheet is **one** image request under a
 * strict, versioned prompt (`oneShotPrompt`), and nothing about the answer is trusted:
 *
 * 1. The grid (`oneShotGrid`) is refused past 8 × 8 before any request; the aspect is the supported one
 *    nearest the sheet's size, and the cells are then found in the image actually returned.
 * 2. The returned sheet is kept as `reference/one-shot-sheet.png` (the grid preview reads it), keyed,
 *    and **grid detection** (projection profiles) finds its real gutters. A count that differs from the
 *    grid asked for is written as the sheet's verdict and the job fails — nothing is sliced or re-cut.
 * 3. Otherwise each cell goes through the frame pipeline (B) as `source: 'sliced'` — each direction's
 *    reference frame first — and a cell more than 20 % off the median size carries the `grid` badge.
 *
 * The per-row verdict is derived from `sprite.json`'s `oneShot` and the frame badges (`oneShotVerdict`).
 */
export const ONE_SHOT_SHEET_FILE = 'reference/one-shot-sheet.png';

export type OneShotDeps = {
  generateImage: (req: ImageBytesRequest) => Promise<GitOpResult<GeneratedImage>>;
  toPng: FrameTranscode;
};

/** Refuses a one-shot job whose grid is too large, before any request. */
export function oneShotPreflight(spec: SpriteAssetSpec, req: Pick<SpriteGenerateRequest, 'turnaround' | 'clips'>): string | null {
  if (spec.kind !== 'sheet' || req.turnaround || spec.method !== 'one-shot') return null;
  const rows = oneShotRows(spec, req.clips);
  if (rows.length === 0) return 'There are no clips to draw.';
  return oneShotBlocker(oneShotGrid(spec, rows));
}

const encode = (img: RgbaImage): Buffer => encodePngRgba8(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);

export function createOneShotRunner(deps: OneShotDeps): SpriteJobRunner {
  return async (ctx) => {
    const spec = ctx.spec;
    if (spec.kind !== 'sheet') throw new Error('Only a sprite sheet is drawn in one shot.');
    const rows = oneShotRows(spec, ctx.clips);
    const grid = oneShotGrid(spec, rows);
    const blocked = rows.length === 0 ? 'There are no clips to draw.' : oneShotBlocker(grid);
    if (blocked) throw new Error(blocked);

    const { provider, model } = handDrawnProvider(spec);
    const palette = spec.palette && 'colours' in spec.palette ? spec.palette.colours : undefined;
    const background = spriteBackgroundRequest(provider, spec.prompt, palette);
    const aspect = oneShotAspect(grid);
    const prompt = oneShotPrompt(spec, grid, rows, background.transparent ? null : { chroma: background.chroma });
    const order = rows.map((r) => ({ clip: r.clip.name, dir: r.dir }));

    ctx.progress({ done: 0, total: 1, stage: 'generating', frame: 'sheet' });
    ctx.countRequest();
    const result = await deps.generateImage({ provider, model, prompt, aspect, ...(background.transparent ? { transparent: true } : {}), signal: ctx.signal });
    if (ctx.signal.aborted) throw new Error('cancelled');
    if (!result.ok) throw new Error(result.kind === 'error' ? result.message : 'The image request failed.');

    const sheet = await decodeFrame(result.value.bytes, deps.toPng);
    await ctx.writeAssetFile(ONE_SHOT_SHEET_FILE, encode(sheet));
    const keyed = background.transparent || hasPartialAlpha(sheet) ? sheet : keyChroma(sheet, background.chroma);
    const detected = detectGrid(keyed);
    const mismatch = compareGrid(detected, grid);
    await ctx.updateSheet((current) => ({
      ...current,
      oneShot: {
        promptVersion: ONE_SHOT_PROMPT_VERSION,
        grid,
        aspect,
        rows: order,
        image: { width: sheet.width, height: sheet.height },
        detected,
        ...(mismatch ? { mismatch } : {}),
      },
    }));
    if (mismatch) throw new Error(mismatch);

    // Slice along the detected gutters; cells keep their background, so the pipeline keys them like any frame.
    const columns = cellBounds(detected.columns, sheet.width);
    const bands = cellBounds(detected.rows, sheet.height);
    const offColumns = outlierSpans(detected.columns);
    const offRows = outlierSpans(detected.rows);
    const { mirror } = handDrawnDirections(spec);
    type Cell = { clip: string; dir: string; n: number; bytes: Buffer; grid: boolean };
    const cells: Cell[] = [];
    rows.forEach((row, r) => {
      for (let n = 0; n < row.clip.frames; n += 1) {
        cells.push({ clip: row.clip.name, dir: row.dir, n, bytes: encode(sliceCell(sheet, columns[n]!, bands[r]!)), grid: offColumns.has(n) || offRows.has(r) });
      }
    });
    const ref = spriteReferenceFrame(spec);
    const isRef = (c: Cell) => c.clip === ref?.clip && c.n === 0;
    const ordered = [...cells.filter(isRef), ...cells.filter((c) => !isRef(c))];
    const total = ordered.length * (1 + Object.keys(mirror).length);
    let done = 0;
    for (const cell of ordered) {
      if (ctx.signal.aborted) throw new Error('cancelled');
      const key = spriteFrameKey(cell.clip, cell.dir, cell.n);
      const meta: Partial<SpriteFrameMeta> = { source: 'sliced', ...(cell.grid ? { badges: ['grid'] } : {}) };
      ctx.progress({ done, total, stage: 'processing', frame: key });
      await ctx.submitFrame({ clip: cell.clip, dir: cell.dir, n: cell.n, bytes: cell.bytes, meta });
      done += 1;
      const mirrored = mirror[cell.dir];
      if (mirrored) {
        await ctx.submitFrame({ clip: cell.clip, dir: mirrored, n: cell.n, bytes: cell.bytes, meta: { ...meta, source: 'mirrored', flipped: true } });
        done += 1;
      }
    }
    ctx.progress({ done, total, stage: 'processing' });
  };
}
