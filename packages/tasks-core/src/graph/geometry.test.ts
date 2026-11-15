import { describe, expect, it } from 'vitest';

import { rectsIntersect } from './geometry';

describe('rectsIntersect', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };

  it('is true for overlapping rects', () => {
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it('is true when one contains the other', () => {
    expect(rectsIntersect(a, { x: 2, y: 2, width: 2, height: 2 })).toBe(true);
  });

  it('is false for separated rects', () => {
    expect(rectsIntersect(a, { x: 100, y: 100, width: 10, height: 10 })).toBe(false);
  });

  it('is false for rects that only share an edge', () => {
    expect(rectsIntersect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectsIntersect(a, { x: 0, y: 10, width: 5, height: 5 })).toBe(false);
  });
});
