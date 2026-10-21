import { describe, expect, it } from 'vitest';

import { recommendSpriteMethod } from './recommend';

const base = { targetPerspective: 'side', directions: 1, style: 'pixel' } as const;

describe('recommendSpriteMethod', () => {
  it('recommends rendering when a model is attached, ahead of every other rule', () => {
    const r = recommendSpriteMethod({ ...base, reference: { kind: 'model', project: 'p', path: 'm' } });
    expect(r.method).toBe('rendered');
    expect(r.reason).toBe('A rigged model is attached: rendering keeps every direction consistent.');
  });
  it('recommends rendering for top-down and isometric with 4 or 8 directions', () => {
    expect(recommendSpriteMethod({ ...base, targetPerspective: 'top-down', directions: 4 }).method).toBe('rendered');
    expect(recommendSpriteMethod({ ...base, targetPerspective: 'isometric', directions: 8 }).method).toBe('rendered');
  });
  it('keeps top-down with one direction hand-drawn', () => {
    expect(recommendSpriteMethod({ ...base, targetPerspective: 'top-down', directions: 1 }).method).toBe('hand-drawn');
  });
  it('recommends hand-drawn for side views', () => {
    expect(recommendSpriteMethod(base).reason).toBe('Side-scrollers need one facing; hand-drawn frames look best.');
  });
  it('recommends hand-drawn for painterly and hand-drawn styles off the side view', () => {
    for (const style of ['painterly', 'hand-drawn'] as const) {
      expect(recommendSpriteMethod({ ...base, targetPerspective: 'front', style }).reason).toBe('Painterly styles come out best drawn frame by frame.');
    }
  });
  it('falls back to hand-drawn', () => {
    expect(recommendSpriteMethod({ ...base, targetPerspective: 'front' }).reason).toBe('Hand-drawn is the general default.');
  });
  it('never recommends one-shot', () => {
    expect(['hand-drawn', 'rendered']).toContain(recommendSpriteMethod(base).method);
  });
});
