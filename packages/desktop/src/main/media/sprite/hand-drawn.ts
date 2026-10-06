import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  framePrompt,
  handDrawnBlocker,
  handDrawnDirections,
  handDrawnProvider,
  nearestAspect,
  parseConsistency,
  spriteBackgroundRequest,
  spriteFrameKey,
  spriteReferenceFrame,
  SPRITE_CONSISTENCY_PROMPT,
  SPRITE_TURNAROUND_PROMPT,
  type GitOpResult,
  type SpriteAssetSpec,
  type SpriteBadge,
  type SpriteClip,
  type SpriteFrameMeta,
  type SpriteGenerateRequest,
} from '@midnite/studio-shared';

import type { ImageBytesRequest } from '../image/image-service';
import type { GeneratedImage } from '../image/types';
import type { VisionCall } from '../model/engines';
import type { SpriteJobRunner } from './sprite-service';

/**
 * Phase 106 Theme D: the hand-drawn frame source. Every frame is its own image request, built from a
 * pose table and drawn with the **locked reference** attached, then handed to the frame pipeline (B).
 *
 * - **Step 1** (`ctx.turnaround`): one turnaround image (front, side, back) at `3:2`, stored as the
 *   unapproved reference. Frames are refused until the user approves it ({@link handDrawnPreflight}).
 * - **Step 2**: clip by clip, direction by direction, frame by frame, at most
 *   {@link HAND_DRAWN_IN_FLIGHT} requests at once. Each direction's reference frame
 *   (`spriteReferenceFrame`) is drawn and submitted alone first — it sets that direction's scale.
 * - **Consistency**: a vision model scores each candidate against the reference. Below the threshold
 *   the frame is re-rolled up to `rerollBudget` times; the best attempt is kept, and if none passed it
 *   carries `inconsistent` with the model's issues. With no vision model (or a failing call) the frame
 *   is kept as `unchecked` and the job says why — a frame is never silently treated as consistent.
 * - **Mirroring**: a 1-direction side sheet draws `e` and submits the same bytes as `w` with
 *   `source: 'mirrored'`, `flipped: true` — the flip is applied where frames are composed (G), like
 *   `anchorNudge`. With `mirror` off ("asymmetric") `w` is drawn from the same pose table instead.
 */
export const HAND_DRAWN_IN_FLIGHT = 2;
export const TURNAROUND_ASPECT = '3:2' as const;

export type HandDrawnDeps = {
  generateImage: (req: ImageBytesRequest) => Promise<GitOpResult<GeneratedImage>>;
  visionCall: VisionCall;
  /** Reads the locked reference; defaults to `<dir>/reference/reference.png`. */
  readReference?: (dir: string) => Promise<Buffer | null>;
};

/** The hand-drawn half of the service's `preflight`: frames need a reference-capable provider and an approved reference. */
export function handDrawnPreflight(spec: SpriteAssetSpec, req: Pick<SpriteGenerateRequest, 'turnaround'>): string | null {
  if (spec.kind !== 'sheet' || req.turnaround || spec.method !== 'hand-drawn') return null;
  return handDrawnBlocker(spec);
}

export const consistencyUnchecked = (reason: string): string => `Consistency not checked: ${reason.replace(/\.$/, '')}.`;

type Planned = { clip: SpriteClip; dir: string; n: number };

export function createHandDrawnRunner(deps: HandDrawnDeps): SpriteJobRunner {
  const readReference = deps.readReference ?? ((dir: string) => readFile(join(dir, 'reference/reference.png')).catch(() => null));

  return async (ctx) => {
    const spec = ctx.spec;
    if (spec.kind !== 'sheet') throw new Error('Only a sprite sheet is drawn frame by frame.');
    const { provider, model } = handDrawnProvider(spec);
    const palette = spec.palette && 'colours' in spec.palette ? spec.palette.colours : undefined;
    const background = spriteBackgroundRequest(provider, spec.prompt, palette);

    const draw = async (prompt: string, aspect: ImageBytesRequest['aspect'], references: readonly GeneratedImage[]): Promise<GeneratedImage> => {
      if (ctx.signal.aborted) throw new Error('cancelled');
      ctx.countRequest();
      const result = await deps.generateImage({
        provider,
        model,
        prompt,
        aspect,
        ...(background.transparent ? { transparent: true } : {}),
        ...(references.length > 0 ? { references } : {}),
        signal: ctx.signal,
      });
      if (!result.ok) throw new Error(result.kind === 'error' ? result.message : 'The image request failed.');
      return result.value;
    };

    if (ctx.turnaround) {
      ctx.progress({ done: 0, total: 1, stage: 'generating', frame: 'reference' });
      const image = await draw(SPRITE_TURNAROUND_PROMPT(spec, background.clause), TURNAROUND_ASPECT, []);
      await ctx.writeReference(image.bytes, { turnaround: true });
      ctx.progress({ done: 1, total: 1, stage: 'processing', frame: 'reference' });
      return;
    }

    const blocked = handDrawnBlocker(spec);
    if (blocked) throw new Error(blocked);
    const referenceBytes = await readReference(ctx.dir);
    if (!referenceBytes) throw new Error('The approved reference image is missing. Generate or attach it again.');
    const reference: GeneratedImage = { bytes: referenceBytes, mime: 'image/png' };
    const referenceB64 = referenceBytes.toString('base64');
    const aspect = nearestAspect(spec.frameSize[0], spec.frameSize[1]);

    const { draw: directions, mirror } = handDrawnDirections(spec);
    const clips = spec.clips.filter((c) => !ctx.clips || ctx.clips.includes(c.name));
    const planned: Planned[] = [];
    for (const clip of clips) for (const dir of directions) for (let n = 0; n < clip.frames; n += 1) planned.push({ clip, dir, n });
    const total = planned.length * (1 + Object.keys(mirror).length / directions.length);
    let done = 0;
    let checking = spec.consistency.enabled;

    /** Scores one candidate; `null` when the check could not run (the job is then unchecked from here on). */
    const score = async (image: GeneratedImage, key: string): Promise<{ score: number; issues: string[] } | null> => {
      ctx.progress({ done, total, stage: 'checking', frame: key });
      const result = await deps.visionCall({ images: [referenceB64, image.bytes.toString('base64')], prompt: SPRITE_CONSISTENCY_PROMPT, json: true, signal: ctx.signal });
      if (ctx.signal.aborted) throw new Error('cancelled');
      const parsed = result.ok ? parseConsistency(result.value.text) : null;
      if (!parsed) {
        checking = false;
        ctx.note(consistencyUnchecked(result.ok ? `${result.value.model} did not answer with a score` : result.kind === 'error' ? result.message : 'the vision call failed'));
        return null;
      }
      return parsed;
    };

    const frame = async ({ clip, dir, n }: Planned): Promise<void> => {
      const key = spriteFrameKey(clip.name, dir, n);
      const prompt = framePrompt(spec, clip, dir, n, background.clause);
      let best: { image: GeneratedImage; score: number; issues: string[] } | null = null;
      let image: GeneratedImage | null = null;
      let unchecked = !checking;
      for (let attempt = 0; attempt <= spec.consistency.rerollBudget; attempt += 1) {
        ctx.progress({ done, total, stage: 'generating', frame: key });
        image = await draw(prompt, aspect, [reference]);
        if (!checking) {
          unchecked = true;
          break;
        }
        const scored = await score(image, key);
        if (!scored) {
          unchecked = true;
          break;
        }
        if (!best || scored.score > best.score) best = { image, ...scored };
        if (scored.score >= spec.consistency.threshold) break;
      }
      const meta: Partial<SpriteFrameMeta> = { source: 'generated' };
      let bytes = image!.bytes;
      if (best && !unchecked) {
        bytes = best.image.bytes;
        meta.score = best.score;
        if (best.score < spec.consistency.threshold) {
          meta.badges = ['inconsistent'];
          meta.issues = best.issues;
        }
      } else if (unchecked && spec.consistency.enabled) {
        meta.badges = ['unchecked'] satisfies SpriteBadge[];
      }
      ctx.progress({ done, total, stage: 'processing', frame: key });
      await ctx.submitFrame({ clip: clip.name, dir, n, bytes, meta });
      done += 1;
      const mirrored = mirror[dir];
      if (mirrored) {
        await ctx.submitFrame({ clip: clip.name, dir: mirrored, n, bytes, meta: { ...meta, source: 'mirrored', flipped: true } });
        done += 1;
      }
      ctx.progress({ done, total, stage: 'processing', frame: key });
    };

    // Each direction's reference frame first, alone; then the rest, HAND_DRAWN_IN_FLIGHT at a time.
    const ref = spriteReferenceFrame(spec);
    const isReference = (p: Planned) => p.clip.name === ref?.clip && p.n === 0;
    const first = planned.filter(isReference);
    const rest = planned.filter((p) => !isReference(p));
    for (const p of first) await frame(p);
    await pool(rest, HAND_DRAWN_IN_FLIGHT, frame, ctx.signal);
  };
}

/** Runs `work` over `items` in order with at most `limit` in flight; the first failure stops new work and rethrows. */
async function pool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>, signal: AbortSignal): Promise<void> {
  let next = 0;
  let failed: unknown = null;
  const lane = async (): Promise<void> => {
    while (failed === null && !signal.aborted && next < items.length) {
      const item = items[next++]!;
      try {
        await work(item);
      } catch (error) {
        failed ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failed !== null) throw failed;
}

