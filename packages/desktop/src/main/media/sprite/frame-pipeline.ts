import {
  alphaBounds,
  chooseChroma,
  darkestColour,
  hasPartialAlpha,
  keyChroma,
  mapToPalette,
  measureFrame,
  medianCut,
  normaliseFrame,
  outline1px,
  rgbaFromRaster,
  SPRITE_DEFAULT_PALETTE_SIZE,
  spriteFrameKey,
  thresholdAlpha,
  validateFrames,
  type RgbaImage,
  type SpriteBadge,
  type SpriteFrameMeasure,
  type SpriteSheetSpec,
} from '@midnite/studio-shared';

import { decodePng, encodePngRgba8 } from '../png/png-codec';

/**
 * Phase 106 Theme B: what makes a sheet precise, whichever method produced the frames. Runs in main,
 * one frame at a time, yielding to the event loop between frames (Decision 7) — each frame is ≈ 2 ms
 * at 128², so a worker would buy nothing measurable.
 *
 * Per frame ({@link processFrame}): decode → key the chroma background (skipped when the provider
 * returned real alpha) → crop, scale by the sheet-wide factor and anchor → pixel mode thresholds alpha
 * → measure. The normalised PNG is written at once, so a cancelled job keeps every finished frame.
 *
 * Per sheet ({@link FramePipeline.finish}): in pixel mode one palette over every frame of the job (or
 * the spec's fixed colours) is applied to each frame, then the optional outline; and the measures
 * become the validation badges.
 *
 * `anchorNudge` is **not** baked in: it is metadata a user edits after generation, applied where frames
 * are composed (the previewer and the packer, Theme G), so nudging never needs a re-render.
 */
export const NOT_A_FRAME_IMAGE = 'A generated frame could not be read as an image.';

export type FrameTranscode = (bytes: Uint8Array) => Promise<Buffer | null>;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

/** PNG bytes decode directly; JPEG/WebP go through `toPng` (Electron's `nativeImage`) first. */
export async function decodeFrame(bytes: Uint8Array, toPng: FrameTranscode): Promise<RgbaImage> {
  const isPng = PNG_SIGNATURE.every((b, i) => bytes[i] === b);
  const png = isPng ? bytes : await toPng(bytes);
  if (!png) throw new Error(NOT_A_FRAME_IMAGE);
  const decoded = decodePng(png);
  if (!decoded.ok) throw new Error(decoded.message);
  return rgbaFromRaster(decoded.image);
}

export const isPixelSheet = (spec: Pick<SpriteSheetSpec, 'style'>): boolean => spec.style === 'pixel';

export type ProcessedFrame = {
  image: RgbaImage;
  measure: SpriteFrameMeasure;
  /** The keyed source's alpha-bounds height — the reference height when this frame sets the scale. */
  sourceHeight: number;
};

/** One frame through keying and normalisation. Pure apart from the decode. */
export async function processFrame(
  bytes: Uint8Array,
  spec: SpriteSheetSpec,
  ctx: { toPng: FrameTranscode; referenceHeight?: number | undefined; rendered?: boolean | undefined },
): Promise<ProcessedFrame> {
  const decoded = await decodeFrame(bytes, ctx.toPng);
  const palette = spec.palette && 'colours' in spec.palette ? spec.palette.colours : undefined;
  // A rendered frame (Theme E) has real alpha and is already at the sheet's one scale (the ortho fit):
  // no keying, no rescale — only anchoring, pixel mode, outline and validation apply.
  const source = ctx.rendered || hasPartialAlpha(decoded) ? decoded : keyChroma(decoded, chooseChroma(spec.prompt, palette));
  const box = alphaBounds(source);
  const sourceHeight = box ? box.y1 - box.y0 : 0;
  const referenceHeight = ctx.referenceHeight ?? (sourceHeight || spec.frameSize[1]);
  const pixel = isPixelSheet(spec);
  let { image } = normaliseFrame(source, { frameSize: spec.frameSize, anchor: spec.anchor, referenceHeight, pixel, ...(ctx.rendered ? { scale: 1 } : {}) });
  if (pixel) image = thresholdAlpha(image);
  const measure = measureFrame(source, image, spec);
  if (spec.outline && !pixel) image = outline1px(image);
  return { image, measure, sourceHeight };
}

export type FramePipelineDeps = {
  toPng: FrameTranscode;
  writeFrame: (frame: { clip: string; dir: string; n: number; png: Buffer }) => Promise<void>;
  readFrame: (clip: string, dir: string, n: number) => Promise<Uint8Array | null>;
  /** Defaults to `setImmediate`. */
  yieldNow?: () => Promise<void>;
};

export type FrameInput = { clip: string; dir: string; n: number; bytes: Uint8Array; rendered?: boolean };

export type FramePipelineResult = {
  /** Pipeline badges for every frame processed in this job. */
  badges: Record<string, SpriteBadge[]>;
  /** Reference height per direction, including any this job established. */
  referenceHeights: Record<string, number>;
  /** The sheet palette this job computed (pixel mode with no fixed colours); absent otherwise. */
  palette?: string[];
};

const encode = (img: RgbaImage): Buffer => encodePngRgba8(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);

export function createFramePipeline(spec: SpriteSheetSpec, deps: FramePipelineDeps, initial: { referenceHeights?: Record<string, number> } = {}) {
  const yieldNow = deps.yieldNow ?? (() => new Promise<void>((resolve) => setImmediate(resolve)));
  const referenceHeights: Record<string, number> = { ...initial.referenceHeights };
  const measures: Record<string, SpriteFrameMeasure> = {};
  const written: FrameInput[] = [];

  /**
   * Processes and writes one frame. The first non-empty frame of a direction sets that direction's
   * scale unless one is already known, so a frame source submits {@link spriteReferenceFrame} first.
   */
  async function process(input: FrameInput): Promise<SpriteFrameMeasure> {
    const result = await processFrame(input.bytes, spec, { toPng: deps.toPng, referenceHeight: referenceHeights[input.dir], rendered: input.rendered });
    if (referenceHeights[input.dir] === undefined && result.sourceHeight > 0) referenceHeights[input.dir] = result.sourceHeight;
    await deps.writeFrame({ clip: input.clip, dir: input.dir, n: input.n, png: encode(result.image) });
    measures[spriteFrameKey(input.clip, input.dir, input.n)] = result.measure;
    written.push(input);
    await yieldNow();
    return result.measure;
  }

  async function finish(): Promise<FramePipelineResult> {
    let palette: string[] | undefined;
    if (isPixelSheet(spec) && written.length > 0) {
      const fixed = spec.palette && 'colours' in spec.palette ? spec.palette.colours : undefined;
      const frames: Array<{ input: FrameInput; image: RgbaImage }> = [];
      for (const input of written) {
        const bytes = await deps.readFrame(input.clip, input.dir, input.n);
        if (bytes) frames.push({ input, image: await decodeFrame(bytes, deps.toPng) });
      }
      const colours = fixed ?? medianCut(frames.map((f) => f.image.data), spec.palette && 'size' in spec.palette ? spec.palette.size : SPRITE_DEFAULT_PALETTE_SIZE);
      if (!fixed) palette = colours;
      const ink = darkestColour(colours);
      for (const { input, image } of frames) {
        let out = mapToPalette(image, colours);
        if (spec.outline) out = outline1px(out, ink);
        await deps.writeFrame({ clip: input.clip, dir: input.dir, n: input.n, png: encode(out) });
        await yieldNow();
      }
    }
    return { badges: validateFrames(measures, spec), referenceHeights: { ...referenceHeights }, ...(palette ? { palette } : {}) };
  }

  return { process, finish, get count() { return written.length; } };
}

export type FramePipeline = ReturnType<typeof createFramePipeline>;
