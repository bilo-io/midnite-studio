import { describe, expect, it } from 'vitest';

import type { ModelClip } from '../media-model-rig';
import { describeRenderedClip, matchModelClip, planRenderedClips, spriteClipNameFor, spriteSampleTimes } from './sampling';

const clip = (name: string, kind: ModelClip['kind'], duration?: number): ModelClip => ({ name, kind, ...(duration ? { duration } : {}) });

describe('spriteSampleTimes', () => {
  it('a 1.2 s clip at 10 fps samples 12 times at 0, 0.1, … 1.1', () => {
    const times = spriteSampleTimes(1.2, 10);
    expect(times).toHaveLength(12);
    times.forEach((t, i) => expect(t).toBeCloseTo(i / 10, 6));
    expect(times.at(-1)).toBeCloseTo(1.1, 6);
  });

  it('samples at least once and at most 64 times', () => {
    expect(spriteSampleTimes(0.01, 8)).toEqual([0]);
    expect(spriteSampleTimes(10, 60)).toHaveLength(64);
  });
});

describe('clip mapping', () => {
  const model = [clip('Walk', 'walk', 1.2), clip('Sprint', 'run', 0.6), clip('Hit', 'getHit'), clip('Wave', 'custom', 2)];

  it('matches by name case-insensitively, then by alias', () => {
    expect(matchModelClip('walk', model)?.name).toBe('Walk');
    expect(matchModelClip('run', model)?.name).toBe('Sprint');
    expect(matchModelClip('hurt', model)?.name).toBe('Hit');
    expect(matchModelClip('jump', model)).toBeUndefined();
  });

  it('plans frames from the model clip at the sprite fps and lists the unmatched both ways', () => {
    const mapping = planRenderedClips(
      [
        { name: 'walk', frames: 8, fps: 10, loop: 'loop' },
        { name: 'jump', frames: 6, fps: 10, loop: 'once' },
        { name: 'fall', frames: 4, fps: 8, loop: 'once' },
      ],
      model,
    );
    expect(mapping.plans).toHaveLength(1);
    expect(mapping.plans[0]!.clip.frames).toBe(12);
    expect(describeRenderedClip(mapping.plans[0]!)).toBe("walk: 12 frames at 10 fps from the model's 1.2 s clip");
    expect(mapping.unmatched).toEqual(['jump', 'fall']);
    expect(mapping.unused.map((c) => c.name)).toEqual(['Sprint', 'Hit', 'Wave']);
  });

  it('a settings fps overrides every clip', () => {
    const { plans } = planRenderedClips([{ name: 'walk', frames: 8, fps: 10, loop: 'loop' }], model, { fps: 5 });
    expect(plans[0]!.clip).toMatchObject({ fps: 5, frames: 6 });
  });

  it('turns a model clip name into a sprite clip name', () => {
    expect(spriteClipNameFor({ name: 'Get Hit' })).toBe('get-hit');
    expect(spriteClipNameFor({ name: 'fallAndGetUp' })).toBe('fall-and-get-up');
    expect(spriteClipNameFor({ name: '123' })).toBeNull();
  });
});
