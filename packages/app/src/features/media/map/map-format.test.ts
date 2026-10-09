import { describe, expect, it } from 'vitest';

import { formatArea, formatDistance } from './map-format';

describe('formatDistance', () => {
  it('metric', () => {
    expect(formatDistance(999.4, 'metric')).toBe('999 m');
    expect(formatDistance(1000, 'metric')).toBe('1.00 km');
    expect(formatDistance(54972.271, 'metric')).toBe('54.97 km');
  });
  it('imperial', () => {
    expect(formatDistance(100, 'imperial')).toBe('328 ft');
    expect(formatDistance(1609.344, 'imperial')).toBe('1.00 mi');
  });
});

describe('formatArea', () => {
  it('metric', () => {
    expect(formatArea(9999, 'metric')).toBe('9,999 m²');
    expect(formatArea(250_000, 'metric')).toBe('25.00 ha');
    expect(formatArea(12_308e6, 'metric')).toBe('12308.00 km²');
  });
  it('imperial', () => {
    expect(formatArea(100, 'imperial')).toBe('1,076 ft²');
    expect(formatArea(40_468.564224, 'imperial')).toBe('10.00 ac');
    expect(formatArea(5e6, 'imperial')).toBe('1.93 mi²');
  });
});
