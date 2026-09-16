// Layer: vitest — pure arithmetic, no canvas needed.
import { describe, expect, it } from 'vitest';

import { computeDegrees, sizeForDegree } from './knowledge-degree';

describe('computeDegrees', () => {
  it('counts a node once per link touching it, either direction', () => {
    const links = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
    ];
    const degrees = computeDegrees(links);
    expect(degrees.get('a')).toBe(2);
    expect(degrees.get('b')).toBe(2);
    expect(degrees.get('c')).toBe(2);
  });

  it('is empty for no links', () => {
    expect(computeDegrees([]).size).toBe(0);
  });

  it('a node linked to itself still counts once per endpoint role', () => {
    const degrees = computeDegrees([{ source: 'a', target: 'a' }]);
    expect(degrees.get('a')).toBe(2);
  });
});

describe('sizeForDegree', () => {
  it('grows with degree but never past the max', () => {
    expect(sizeForDegree(0)).toBe(2);
    expect(sizeForDegree(4)).toBe(4);
    expect(sizeForDegree(10_000)).toBe(14);
  });

  it('never shrinks below the min for a negative degree', () => {
    expect(sizeForDegree(-5)).toBe(2);
  });
});
