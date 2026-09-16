// Layer: vitest — pure string/number math, no canvas needed.
import { describe, expect, it } from 'vitest';

import { alphaForWeight, withAlpha } from './knowledge-canvas-colors';

describe('withAlpha', () => {
  it('turns an rgb() string into rgba() with the given alpha', () => {
    expect(withAlpha('rgb(60, 131, 246)', 0.2)).toBe('rgba(60, 131, 246, 0.2)');
  });

  it('returns the input unchanged if it is not rgb()-shaped', () => {
    expect(withAlpha('#fff', 0.2)).toBe('#fff');
    expect(withAlpha('hsl(217 91% 60%)', 0.2)).toBe('hsl(217 91% 60%)');
  });
});

describe('alphaForWeight', () => {
  it('maps 0 to the floor and 1 to the ceiling', () => {
    expect(alphaForWeight(0)).toBe(0.15);
    expect(alphaForWeight(1)).toBe(0.8);
  });

  it('clamps a weight outside 0..1', () => {
    expect(alphaForWeight(-5)).toBe(0.15);
    expect(alphaForWeight(5)).toBe(0.8);
  });

  it('interpolates in between', () => {
    expect(alphaForWeight(0.5)).toBeCloseTo(0.475);
  });
});
