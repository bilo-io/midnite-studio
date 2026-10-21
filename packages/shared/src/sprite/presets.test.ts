import { describe, expect, it } from 'vitest';

import { clipsMatchPreset, presetClips, SPRITE_CLIP_PRESETS } from './presets';

describe('SPRITE_CLIP_PRESETS', () => {
  it('side has eight clips with the documented counts', () => {
    expect(SPRITE_CLIP_PRESETS.side.map((c) => `${c.name} ${c.frames}@${c.fps}`)).toEqual([
      'idle 4@6', 'walk 8@10', 'run 8@12', 'jump 4@10', 'fall 2@8', 'attack 6@12', 'hurt 2@8', 'die 6@8',
    ]);
    expect(SPRITE_CLIP_PRESETS.side.find((c) => c.name === 'jump')?.loop).toBe('once');
  });
  it('top-down and isometric share idle, walk, attack and die', () => {
    for (const p of ['top-down', 'isometric'] as const) {
      expect(SPRITE_CLIP_PRESETS[p].map((c) => c.name)).toEqual(['idle', 'walk', 'attack', 'die']);
    }
    expect(SPRITE_CLIP_PRESETS['top-down'].find((c) => c.name === 'die')).toMatchObject({ frames: 6, fps: 8, loop: 'once' });
  });
  it('front has idle and walk', () => {
    expect(SPRITE_CLIP_PRESETS.front.map((c) => c.name)).toEqual(['idle', 'walk']);
  });
  it('returns editable copies and detects edits', () => {
    const clips = presetClips('side');
    expect(clipsMatchPreset(clips, 'side')).toBe(true);
    clips[0]!.frames = 5;
    expect(clipsMatchPreset(clips, 'side')).toBe(false);
    expect(SPRITE_CLIP_PRESETS.side[0]!.frames).toBe(4);
  });
});
