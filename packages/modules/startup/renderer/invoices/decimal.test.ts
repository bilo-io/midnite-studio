import { describe, expect, it } from 'vitest';

import { decimalToInt, intToDecimal } from './decimal';

describe('decimal text', () => {
  it('parses without a float', () => {
    expect(decimalToInt('1,250.50', 2)).toBe(125050);
    expect(decimalToInt('0.1', 2)).toBe(10);
    expect(decimalToInt('1.005', 3)).toBe(1005);
    expect(decimalToInt('.5', 3)).toBe(500);
    expect(decimalToInt('20', 2)).toBe(2000);
  });
  it('refuses what is not a plain number or has too many places', () => {
    expect(decimalToInt('1.234', 2)).toBeNull();
    expect(decimalToInt('abc', 2)).toBeNull();
    expect(decimalToInt('-1', 2)).toBeNull();
    expect(decimalToInt('', 2)).toBeNull();
  });
  it('formats back', () => {
    expect(intToDecimal(125050, 2)).toBe('1250.50');
    expect(intToDecimal(5, 2)).toBe('0.05');
    expect(intToDecimal(1500, 3)).toBe('1.500');
    expect(intToDecimal(7, 0)).toBe('7');
  });
});
