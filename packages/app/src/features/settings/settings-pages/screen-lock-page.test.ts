import { describe, expect, it } from 'vitest';

import {
  INACTIVITY_DEFAULT_S,
  INACTIVITY_MAX_S,
  INACTIVITY_MIN_S,
  INACTIVITY_PRESETS_S,
  nearestInactivityPresetIndex,
} from './screen-lock-page';

describe('ScreenLockPage preset helpers', () => {
  it('finds exact matches for presets', () => {
    expect(nearestInactivityPresetIndex(60)).toBe(0);
    expect(nearestInactivityPresetIndex(900)).toBe(3);
    expect(nearestInactivityPresetIndex(14400)).toBe(7);
  });

  it('finds nearest preset for arbitrary values', () => {
    expect(nearestInactivityPresetIndex(200)).toBe(1); // 300 is closer than 60
    expect(nearestInactivityPresetIndex(5000)).toBe(5); // 3600 is closer than 7200
  });

  it('keeps min, max and default constants aligned', () => {
    expect(INACTIVITY_MIN_S).toBe(INACTIVITY_PRESETS_S[0]);
    expect(INACTIVITY_MAX_S).toBe(INACTIVITY_PRESETS_S[INACTIVITY_PRESETS_S.length - 1]);
    expect(INACTIVITY_PRESETS_S).toContain(INACTIVITY_DEFAULT_S);
  });
});
