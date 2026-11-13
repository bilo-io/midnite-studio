import { describe, expect, it } from 'vitest';

import { cmToFtIn, formatHeight, formatWeight, ftInToCm, kgToLb, lbToKg } from './units';

describe('units', () => {
  it('lb round-trips', () => expect(Math.abs(lbToKg(kgToLb(81.3)) - 81.3)).toBeLessThan(1e-9));
  it('180 cm is 5 ft 11 in', () => expect(cmToFtIn(180)).toEqual({ ft: 5, in: 11 }));
  it('carries a rounded 12 inches into the feet', () => expect(cmToFtIn(182.8)).toEqual({ ft: 6, in: 0 }));
  it('rounds inches to 0.5', () => expect(cmToFtIn(175)).toEqual({ ft: 5, in: 9 }));
  it('ft/in back to cm', () => expect(ftInToCm(5, 11)).toBeCloseTo(180.34, 2));
  it('formats weight to one decimal in the chosen units', () => {
    expect(formatWeight(81.3, 'metric')).toBe('81.3 kg');
    expect(formatWeight(81.3, 'imperial')).toBe('179.2 lb');
  });
  it('formats height', () => {
    expect(formatHeight(180, 'metric')).toBe('180 cm');
    expect(formatHeight(180, 'imperial')).toBe('5 ft 11 in');
  });
});
