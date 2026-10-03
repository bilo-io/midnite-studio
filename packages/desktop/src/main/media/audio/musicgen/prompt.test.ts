import { AUDIO_LOCAL_SEGMENT_S } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { captionFor, planSegments, SECTION_CROSSFADE_S } from './prompt';

describe('planSegments', () => {
  it('uses one render up to the model window', () => {
    expect(planSegments(20)).toEqual([{ index: 0, seconds: 20, tokens: 1000 }]);
    expect(planSegments(AUDIO_LOCAL_SEGMENT_S)).toHaveLength(1);
  });

  it.each([45, 60, 90, 120])('splits %is into windows that stitch back to the requested length', (total) => {
    const segments = planSegments(total);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) expect(s.seconds).toBeLessThanOrEqual(AUDIO_LOCAL_SEGMENT_S + 1e-9);
    const stitched = segments.reduce((sum, s) => sum + s.seconds, 0) - (segments.length - 1) * SECTION_CROSSFADE_S;
    expect(stitched).toBeCloseTo(total, 6);
  });

  it('caps at the local maximum and floors tiny requests', () => {
    const capped = planSegments(480);
    const total = capped.reduce((n, s) => n + s.seconds, 0) - (capped.length - 1) * SECTION_CROSSFADE_S;
    expect(total).toBeCloseTo(120, 6);
    expect(planSegments(1)[0]!.seconds).toBe(5);
  });
});

describe('captionFor', () => {
  const base = { title: '', style: [] as string[] };
  it('prefers explicit section captions and cycles them', () => {
    const prompt = { ...base, musicPrompt: 'whole', sections: ['intro', 'peak'] };
    expect([0, 1, 2].map((i) => captionFor(prompt, i))).toEqual(['intro', 'peak', 'intro']);
  });
  it('falls back through musicPrompt, style tags, title and a default', () => {
    expect(captionFor({ ...base, musicPrompt: 'a caption', style: ['x'] }, 0)).toBe('a caption');
    expect(captionFor({ ...base, style: ['lofi', 'chill'] }, 0)).toBe('lofi, chill');
    expect(captionFor({ ...base, title: ' Night drive ' }, 0)).toBe('Night drive');
    expect(captionFor(base, 0)).toBe('instrumental music');
  });
});
