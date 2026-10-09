import { describe, expect, it } from 'vitest';

import { arrangementSpan, rulerLines } from './ruler';

describe('rulerLines', () => {
  it('lists beats with bar numbers on the downbeats', () => {
    const lines = rulerLines([{ tick: 0, numerator: 4, denominator: 4 }], 0, 1920 + 1);
    expect(lines.filter((l) => l.bar !== null)).toEqual([{ tick: 0, bar: 1 }, { tick: 1920, bar: 2 }]);
    expect(lines.filter((l) => l.tick < 1920)).toHaveLength(4);
  });
  it('starts at the first line inside the window', () => {
    expect(rulerLines([{ tick: 0, numerator: 4, denominator: 4 }], 500, 1000).map((l) => l.tick)).toEqual([960]);
  });
  it('restarts the bar on a signature change', () => {
    const lines = rulerLines(
      [{ tick: 0, numerator: 4, denominator: 4 }, { tick: 1920, numerator: 3, denominator: 4 }],
      0,
      1920 + 1441,
    );
    expect(lines.filter((l) => l.bar !== null).map((l) => [l.tick, l.bar])).toEqual([[0, 1], [1920, 2], [3360, 3]]);
  });
});

describe('arrangementSpan', () => {
  it('gives room past the last note and at least eight bars', () => {
    expect(arrangementSpan(0, 1920)).toBe(1920 * 8);
    expect(arrangementSpan(1920 * 10, 1920)).toBe(1920 * 12);
  });
});
