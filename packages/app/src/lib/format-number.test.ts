import { describe, expect, it } from 'vitest';
import { formatNumber } from './format-number';

describe('formatNumber', () => {
  it('formats small numbers without separators', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(42)).toBe('42');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands with comma separators', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(12345)).toBe('12,345');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats negative numbers correctly', () => {
    expect(formatNumber(-1000)).toBe('-1,000');
    expect(formatNumber(-50000)).toBe('-50,000');
  });
});
