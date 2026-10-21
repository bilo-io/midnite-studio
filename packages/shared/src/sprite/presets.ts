import type { SpriteClip, SpritePerspective } from '../media-sprite';

const clip = (name: string, frames: number, fps: number, loop: SpriteClip['loop']): SpriteClip => ({ name, frames, fps, loop });

const GROUND: readonly SpriteClip[] = [
  clip('idle', 4, 6, 'loop'),
  clip('walk', 8, 10, 'loop'),
  clip('attack', 6, 12, 'once'),
  clip('die', 6, 8, 'once'),
];

/** The clips a sheet starts with, per perspective. Editable in the form; frame counts and fps are data, not code. */
export const SPRITE_CLIP_PRESETS: Record<SpritePerspective, readonly SpriteClip[]> = {
  side: [
    clip('idle', 4, 6, 'loop'),
    clip('walk', 8, 10, 'loop'),
    clip('run', 8, 12, 'loop'),
    clip('jump', 4, 10, 'once'),
    clip('fall', 2, 8, 'loop'),
    clip('attack', 6, 12, 'once'),
    clip('hurt', 2, 8, 'once'),
    clip('die', 6, 8, 'once'),
  ],
  'top-down': GROUND,
  isometric: GROUND,
  front: [clip('idle', 4, 6, 'loop'), clip('walk', 8, 10, 'loop')],
};

/** A fresh copy of a perspective's preset, safe to edit. */
export const presetClips = (perspective: SpritePerspective): SpriteClip[] => SPRITE_CLIP_PRESETS[perspective].map((c) => ({ ...c }));

/** Whether `clips` still equals the preset for `perspective` (so a perspective change may replace them silently). */
export function clipsMatchPreset(clips: readonly SpriteClip[], perspective: SpritePerspective): boolean {
  const preset = SPRITE_CLIP_PRESETS[perspective];
  return clips.length === preset.length && clips.every((c, i) => {
    const p = preset[i]!;
    return c.name === p.name && c.frames === p.frames && c.fps === p.fps && c.loop === p.loop;
  });
}
