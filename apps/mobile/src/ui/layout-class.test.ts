import { describe, expect, it } from 'vitest';
import { layoutClassFor } from './layout-class';

describe('layoutClassFor', () => {
  it.each([
    [0, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [899, 'medium'],
    [900, 'expanded'],
    [1366, 'expanded'],
  ] as const)('%ddp is %s', (width, expected) => {
    expect(layoutClassFor(width)).toBe(expected);
  });
});
