import { describe, expect, it } from 'vitest';

import { fromMinor, toMinor } from './money-input';

describe('money input', () => {
  it('converts between text and minor units without float drift', () => {
    expect(toMinor('1,250.50', 'GBP')).toBe(125050);
    expect(toMinor('0.29', 'GBP')).toBe(29);
    expect(toMinor('1000', 'JPY')).toBe(1000);
    expect(toMinor('-5', 'USD')).toBe(-500);
    expect(fromMinor(125050, 'GBP')).toBe('1250.50');
    expect(fromMinor(1000, 'JPY')).toBe('1000');
  });
  it('refuses text that is not a number', () => {
    expect(toMinor('', 'GBP')).toBeNull();
    expect(toMinor('12abc', 'GBP')).toBeNull();
  });
});
