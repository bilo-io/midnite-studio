import { z } from 'zod';

import { IMAGE_ASPECTS, imageModelSupportsReference, imageProviderInfo, imageReferenceUnsupportedReason, type ImageAspect, type ImageProviderId } from '../media';
import { SPRITE_APPROVE_FIRST, SPRITE_DIRECTIONS, SPRITE_NO_REFERENCE, type SpriteClip, type SpritePerspective, type SpriteSheetSpec } from '../media-sprite';

/**
 * Hand-drawn frames (Phase 106 Theme D): one image request per frame, each built from a pose table
 * and drawn against the locked reference image. Everything here is text and tables, so the prompts
 * an agent or the UI would send are unit-tested as strings.
 */

/** One pose phrase per frame of each preset clip (`SPRITE_CLIP_PRESETS`), in frame order. */
export const SPRITE_POSE_TABLES: Readonly<Record<string, readonly string[]>> = {
  idle: [
    'standing relaxed, weight centred, breathing in',
    'standing relaxed, chest slightly raised at the top of the breath',
    'standing relaxed, breathing out',
    'standing relaxed, shoulders slightly lowered at the bottom of the breath',
  ],
  walk: [
    'contact (left foot forward)',
    'down',
    'passing',
    'up',
    'contact (right foot forward)',
    'down (mirrored)',
    'passing (mirrored)',
    'up (mirrored)',
  ],
  run: [
    'contact (left foot strikes the ground)',
    'down, body at its lowest',
    'push off from the left foot',
    'flight, both feet off the ground',
    'contact (right foot strikes the ground)',
    'down, body at its lowest (mirrored)',
    'push off from the right foot',
    'flight, both feet off the ground (mirrored)',
  ],
  jump: ['crouch, knees bent, ready to spring', 'take-off, legs extending', 'rising, knees tucked', 'apex, body stretched'],
  fall: ['falling, arms raised for balance', 'falling, legs reaching down for the landing'],
  attack: [
    'anticipation, weapon or arm drawn back',
    'wind-up at full extension behind',
    'strike begins, swinging forward',
    'impact, arm or weapon fully extended',
    'follow-through past the target',
    'recovery, returning to stance',
  ],
  hurt: ['recoiling from a hit, head snapped back', 'staggering, off balance'],
  die: [
    'struck, body jolting',
    'knees buckling',
    'falling backwards',
    'hitting the ground',
    'bouncing slightly on the ground',
    'lying still on the ground',
  ],
};

/** How each direction folder reads in a prompt. */
const DIRECTION_PHRASES: Readonly<Record<string, string>> = {
  e: 'facing right (east)',
  w: 'facing left (west)',
  s: 'facing the viewer (south)',
  n: 'facing away from the viewer (north)',
  se: 'facing down-right (south-east), three-quarter front view',
  sw: 'facing down-left (south-west), three-quarter front view',
  ne: 'facing up-right (north-east), three-quarter back view',
  nw: 'facing up-left (north-west), three-quarter back view',
};

const PERSPECTIVE_PHRASES: Readonly<Record<SpritePerspective, string>> = {
  side: 'side view, as in a 2D side-scrolling platformer',
  'top-down': 'top-down view from a steep camera above, as in a top-down action game',
  isometric: 'isometric view (2:1), as in an isometric strategy game',
  front: 'straight-on front view',
};

const STYLE_PHRASES: Readonly<Record<SpriteSheetSpec['style'], string>> = {
  pixel: 'crisp pixel-art game sprite with a limited palette',
  'hand-drawn': 'hand-drawn 2D game sprite with clean line art',
  painterly: 'painterly 2D game sprite',
  flat: 'flat-colour vector-style 2D game sprite',
};

export const SPRITE_FRAME_SUFFIX = 'Same character as the reference image. Full body, centred, no text.';

/** The pose of frame `i`: the clip's own `poses`, the preset table (resampled when the count differs), or a generic line. */
export function framePose(clip: Pick<SpriteClip, 'name' | 'frames' | 'poses'>, i: number): string {
  if (clip.poses && clip.poses.length > 0) return clip.poses[Math.min(i, clip.poses.length - 1)]!;
  const table = SPRITE_POSE_TABLES[clip.name];
  if (table) return table[Math.min(table.length - 1, Math.floor((i * table.length) / clip.frames))]!;
  return `frame ${i + 1} of ${clip.frames} of a ${clip.name} animation`;
}

/**
 * One frame's prompt: style + subject + perspective + direction + pose, then the background clause the
 * provider needs (`spriteBackgroundRequest`; empty when the provider returns real alpha) and
 * {@link SPRITE_FRAME_SUFFIX}.
 */
export function framePrompt(
  spec: Pick<SpriteSheetSpec, 'style' | 'targetPerspective' | 'prompt'>,
  clip: Pick<SpriteClip, 'name' | 'frames' | 'poses'>,
  dir: string,
  i: number,
  backgroundClause = '',
): string {
  const subject = spec.prompt.trim() || 'the character';
  return [
    `A ${STYLE_PHRASES[spec.style]} of ${subject}.`,
    `${capitalise(PERSPECTIVE_PHRASES[spec.targetPerspective])}, ${DIRECTION_PHRASES[dir] ?? `facing ${dir}`}.`,
    `${capitalise(clip.name)} animation, frame ${i + 1} of ${clip.frames}: ${framePose(clip, i)}.`,
    backgroundClause,
    SPRITE_FRAME_SUFFIX,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Step 1: the character turnaround — one image, front, side and back, that becomes the locked reference. */
export function SPRITE_TURNAROUND_PROMPT(spec: Pick<SpriteSheetSpec, 'style' | 'prompt'>, backgroundClause = ''): string {
  const subject = spec.prompt.trim() || 'a game character';
  return [
    `A character turnaround sheet for a ${STYLE_PHRASES[spec.style]} of ${subject}.`,
    'Three full-body views of the same character side by side at the same scale and baseline: front, side (facing right) and back.',
    'Neutral standing pose, arms slightly away from the body, even lighting.',
    backgroundClause,
    'No text, labels, grid or borders.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The vision check: the reference is the first image, the frame the second. */
export const SPRITE_CONSISTENCY_PROMPT = [
  'The first image is the reference design of a game character. The second image is one animation frame that should show the same character.',
  'Ignore the pose, the facing direction and the background. Judge only whether it is the same character: the same outfit, colour palette, proportions and distinguishing features.',
  'Answer with JSON only: {"score": <0 to 1, where 1 is clearly the same character>, "issues": [<short phrases naming what differs; empty when nothing does>]}.',
].join(' ');

export const SpriteConsistencySchema = z.object({
  score: z.coerce.number().min(0).max(1),
  issues: z.array(z.string()).default([]),
});
export type SpriteConsistency = z.infer<typeof SpriteConsistencySchema>;

/** The vision model's answer, or `null` when it is not the JSON asked for (a fenced block is tolerated). */
export function parseConsistency(text: string): SpriteConsistency | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  try {
    const parsed = SpriteConsistencySchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) return null;
    return { score: parsed.data.score, issues: parsed.data.issues.map((i) => i.slice(0, 300)).slice(0, 8) };
  } catch {
    return null;
  }
}

/** The supported aspect closest to `width × height` (smallest |log ratio| difference). */
export function nearestAspect(width: number, height: number): ImageAspect {
  const target = Math.log(width / height);
  let best: ImageAspect = '1:1';
  let bestDiff = Infinity;
  for (const aspect of IMAGE_ASPECTS) {
    const [w, h] = aspect.split(':').map(Number) as [number, number];
    const diff = Math.abs(Math.log(w / h) - target);
    if (diff < bestDiff) {
      best = aspect;
      bestDiff = diff;
    }
  }
  return best;
}

/** The provider and model a hand-drawn sheet draws with (Gemini 2.5 Flash Image when the spec names none). */
export function handDrawnProvider(spec: Pick<SpriteSheetSpec, 'provider' | 'model'>): { provider: ImageProviderId; model: string } {
  const provider = spec.provider ?? 'gemini';
  return { provider, model: spec.model ?? imageProviderInfo(provider).models[0]?.id ?? '' };
}

/** Why a hand-drawn job cannot draw frames from this spec yet, or `null`. */
export function handDrawnBlocker(spec: SpriteSheetSpec): string | null {
  const { provider, model } = handDrawnProvider(spec);
  if (!imageModelSupportsReference(provider, model)) return imageReferenceUnsupportedReason(provider === 'gemini' ? 'Imagen' : imageProviderInfo(provider).label);
  if (spec.reference?.kind !== 'image') return SPRITE_NO_REFERENCE;
  if (!spec.reference.approved) return SPRITE_APPROVE_FIRST;
  return null;
}

/**
 * The directions a hand-drawn job draws, and the ones it mirrors. A 1-direction side sheet draws `e`
 * and mirrors it to `w` (or draws both when `mirror` is off); every other sheet draws each direction.
 */
export function handDrawnDirections(spec: Pick<SpriteSheetSpec, 'directions' | 'targetPerspective' | 'mirror'>): { draw: string[]; mirror: Record<string, string> } {
  if (spec.directions === 1 && spec.targetPerspective === 'side') {
    return spec.mirror ? { draw: ['e'], mirror: { e: 'w' } } : { draw: ['e', 'w'], mirror: {} };
  }
  if (spec.directions === 1) return { draw: ['s'], mirror: {} };
  return { draw: [...SPRITE_DIRECTIONS[spec.directions]], mirror: {} };
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
