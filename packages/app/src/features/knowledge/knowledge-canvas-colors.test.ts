// Layer: vitest — pure string/number math, no canvas needed.
import { describe, expect, it } from 'vitest';

import { alphaForWeight, withAlpha } from './knowledge-canvas-colors';

describe('withAlpha', () => {
  it('turns an rgb() string into a PREMULTIPLIED rgba() — sigma blends with ONE / ONE_MINUS_SRC_ALPHA', () => {
    expect(withAlpha('rgb(60, 131, 246)', 0.2)).toBe('rgba(12, 26, 49, 0.2)');
  });

  it('alpha 1 leaves the channels untouched; alpha 0 zeroes them', () => {
    expect(withAlpha('rgb(60, 131, 246)', 1)).toBe('rgba(60, 131, 246, 1)');
    expect(withAlpha('rgb(60, 131, 246)', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('clamps alpha into 0..1', () => {
    expect(withAlpha('rgb(100, 100, 100)', 2)).toBe('rgba(100, 100, 100, 1)');
    expect(withAlpha('rgb(100, 100, 100)', -1)).toBe('rgba(0, 0, 0, 0)');
  });

  it('keeps every channel an integer — sigma parses rgba() channels with [0-9]*', () => {
    expect(withAlpha('rgb(255, 1, 7)', 0.3)).toBe('rgba(77, 0, 2, 0.3)');
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
