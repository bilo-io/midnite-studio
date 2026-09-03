import { describe, expect, it } from 'vitest';

import { fmtLocationName, fmtTemperature, weatherCondition } from './weather-derive';

describe('fmtTemperature', () => {
  it('rounds and appends the unit glyph', () => {
    expect(fmtTemperature(18.4, 'celsius')).toBe('18°C');
    expect(fmtTemperature(64.6, 'fahrenheit')).toBe('65°F');
  });
});

describe('fmtLocationName', () => {
  it('joins name, region and country when both are present', () => {
    expect(fmtLocationName({ name: 'London', latitude: 0, longitude: 0, admin1: 'England', country: 'United Kingdom' })).toBe(
      'London, England, United Kingdom',
    );
  });

  it('omits the region when it duplicates the name', () => {
    expect(fmtLocationName({ name: 'Singapore', latitude: 0, longitude: 0, admin1: 'Singapore', country: 'Singapore' })).toBe(
      'Singapore, Singapore',
    );
  });

  it('renders just the name when region and country are absent', () => {
    expect(fmtLocationName({ name: 'Nowhere', latitude: 0, longitude: 0 })).toBe('Nowhere');
  });
});

describe('weatherCondition', () => {
  it('maps clear sky', () => {
    expect(weatherCondition(0).label).toBe('Clear sky');
  });

  it('maps every documented WMO code to a non-Unknown label', () => {
    const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
    for (const code of codes) {
      expect(weatherCondition(code).label).not.toBe('Unknown');
    }
  });

  it('falls back to Unknown for an unrecognised code', () => {
    expect(weatherCondition(999).label).toBe('Unknown');
  });
});
