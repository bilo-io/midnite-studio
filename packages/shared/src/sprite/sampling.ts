import { clipTiming, type ModelClip } from '../media-model-rig';
import type { SpriteClip, SpriteRenderSettings } from '../media-sprite';

/**
 * Phase 106 Theme E: which Models clip renders each sprite clip, and when it is sampled.
 *
 * A sprite clip maps to the model clip of the same name (case-insensitive), else to the first model
 * clip named (or of a kind named) in {@link SPRITE_CLIP_ALIASES}. A sprite clip with no match is
 * skipped and listed; a model clip nothing used can be added as a new sprite clip.
 *
 * Sampling is at the clip's fps: `frames = round(duration × fps)` overrides the preset's count, and
 * frame `i` is the pose at `i / fps` — so a looping clip's last frame is one step before the first.
 */
export const SPRITE_CLIP_ALIASES: Readonly<Record<string, readonly string[]>> = {
  run: ['sprint', 'jog'],
  attack: ['punch', 'slash', 'swing'],
  die: ['death'],
  hurt: ['hit', 'gethit'],
};

const lower = (s: string): string => s.toLowerCase();

/** The model clip a sprite clip renders, or `undefined`. */
export function matchModelClip(spriteClip: string, modelClips: readonly ModelClip[]): ModelClip | undefined {
  const name = lower(spriteClip);
  const exact = modelClips.find((c) => lower(c.name) === name) ?? modelClips.find((c) => lower(c.kind) === name);
  if (exact) return exact;
  for (const alias of SPRITE_CLIP_ALIASES[name] ?? []) {
    const hit = modelClips.find((c) => lower(c.name) === alias) ?? modelClips.find((c) => lower(c.kind) === alias);
    if (hit) return hit;
  }
  return undefined;
}

export type RenderedClipPlan = {
  /** The sprite clip, its `frames` and `fps` replaced by what the model clip yields. */
  clip: SpriteClip;
  modelClip: ModelClip;
  /** The model clip's length in seconds. */
  duration: number;
  /** Pose times, one per frame. */
  times: number[];
};

export type RenderedClipMapping = {
  plans: RenderedClipPlan[];
  /** Sprite clips with no matching animation (skipped). */
  unmatched: string[];
  /** Model clips no sprite clip renders — offered as new sprite clips. */
  unused: ModelClip[];
};

/** Sample times `i / fps` for `i < round(duration × fps)` (at least one, at most 64). */
export function spriteSampleTimes(duration: number, fps: number): number[] {
  const frames = Math.min(64, Math.max(1, Math.round(duration * fps)));
  return Array.from({ length: frames }, (_, i) => Math.round((i / fps) * 1e6) / 1e6);
}

/** Maps every sprite clip onto the model's clips and works out its frames at its fps. */
export function planRenderedClips(
  spriteClips: readonly SpriteClip[],
  modelClips: readonly ModelClip[],
  settings: Pick<SpriteRenderSettings, 'fps'> = {},
): RenderedClipMapping {
  const plans: RenderedClipPlan[] = [];
  const unmatched: string[] = [];
  const used = new Set<ModelClip>();
  for (const clip of spriteClips) {
    const modelClip = matchModelClip(clip.name, modelClips);
    if (!modelClip) {
      unmatched.push(clip.name);
      continue;
    }
    used.add(modelClip);
    const fps = settings.fps ?? clip.fps;
    const { duration } = clipTiming(modelClip);
    const times = spriteSampleTimes(duration, fps);
    plans.push({ clip: { ...clip, fps, frames: times.length }, modelClip, duration, times });
  }
  return { plans, unmatched, unused: modelClips.filter((c) => !used.has(c)) };
}

/** `"walk: 12 frames at 10 fps from the model's 1.2 s clip"`. */
export function describeRenderedClip(plan: RenderedClipPlan): string {
  const seconds = Math.round(plan.duration * 100) / 100;
  return `${plan.clip.name}: ${plan.clip.frames} ${plan.clip.frames === 1 ? 'frame' : 'frames'} at ${plan.clip.fps} fps from the model's ${seconds} s clip`;
}

/** A model clip as a new sprite clip name (`Get Hit` → `get-hit`), or `null` when it cannot be one. */
export function spriteClipNameFor(modelClip: Pick<ModelClip, 'name'>): string | null {
  const name = modelClip.name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return /^[a-z][a-z0-9-]{0,31}$/.test(name) ? name : null;
}
