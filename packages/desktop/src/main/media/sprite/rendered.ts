import { resolveRenderSettings, SPRITE_NEEDS_MODEL, spriteDirections, spriteFrameKey } from '@midnite/studio-shared';

import type { RenderRelay } from './render-relay';
import type { SpriteJobRunner } from './sprite-service';

/**
 * Phase 106 Theme E: the rendered-from-3D frame source. The window renders the attached Models
 * character (`SpriteRenderHost`) and posts frames; each one enters the frame pipeline (B) as
 * `source: 'rendered'` — real alpha, so no keying, and already at the sheet's one scale, so no
 * rescale. Each rendered clip's frame count comes from the model clip's length at its fps, and is
 * written back into `sprite.json` so the clip table, the previewer and the packer agree with the disk.
 */
export function createRenderedRunner(relay: Pick<RenderRelay, 'render'>): SpriteJobRunner {
  return async (ctx) => {
    const spec = ctx.spec;
    if (spec.kind !== 'sheet') throw new Error('Only a sprite sheet is rendered from 3D.');
    if (spec.reference?.kind !== 'model') throw new Error(SPRITE_NEEDS_MODEL);
    const clips = spec.clips.filter((c) => !ctx.clips || ctx.clips.includes(c.name));
    if (clips.length === 0) throw new Error('There are no clips to render.');
    const settings = resolveRenderSettings(spec);
    let done = 0;
    let total = 0;
    let counts: Array<{ name: string; frames: number; fps: number }> | undefined;
    ctx.progress({ done, total, stage: 'generating' });
    await relay.render(
      {
        jobId: ctx.jobId,
        repoId: ctx.target.repoId,
        model: { project: spec.reference.project, path: spec.reference.path },
        frameSize: spec.frameSize,
        directions: [...spriteDirections(spec)],
        settings,
        clips,
      },
      {
        signal: ctx.signal,
        onBatch: (batch) => {
          if (batch.total !== undefined) total = batch.total;
          for (const note of batch.notes ?? []) ctx.note(note);
          if (batch.clips) counts = batch.clips;
        },
        onFrame: async (frame) => {
          const key = spriteFrameKey(frame.clip, frame.dir, frame.index);
          ctx.progress({ done, total, stage: 'processing', frame: key });
          await ctx.submitFrame({ clip: frame.clip, dir: frame.dir, n: frame.index, bytes: Buffer.from(frame.png, 'base64'), meta: { source: 'rendered' } });
          done += 1;
          ctx.progress({ done, total, stage: 'processing', frame: key });
        },
      },
    );
    const rendered = counts;
    if (rendered && rendered.length > 0) {
      await ctx.updateSheet((current) => ({
        ...current,
        clips: current.clips.map((c) => {
          const hit = rendered.find((r) => r.name === c.name);
          return hit ? { ...c, frames: hit.frames, fps: hit.fps } : c;
        }),
      }));
    }
  };
}
