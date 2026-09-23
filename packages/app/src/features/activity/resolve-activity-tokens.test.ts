import { ACTIVITY_PRESETS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { activityTokenNames, resolveActivityTokens } from './resolve-activity-tokens';

describe('resolveActivityTokens', () => {
  it('writes a solid status as a single --activity-<status> property and clears the gradient set', () => {
    const brand = ACTIVITY_PRESETS.brand;
    if (!brand) throw new Error('brand preset missing');
    const tokens = resolveActivityTokens(brand);
    expect(tokens['--activity-waiting']).toBe('#f59e0b');
    expect(tokens['--activity-waiting-from']).toBeNull();
    expect(tokens['--activity-waiting-via']).toBeNull();
    expect(tokens['--activity-waiting-to']).toBeNull();
    expect(tokens['--activity-waiting-ramp']).toBeNull();
  });

  it('writes a four-stop gradient as from/to/ramp with no -via (only a three-stop gradient gets one)', () => {
    const brand = ACTIVITY_PRESETS.brand;
    if (!brand) throw new Error('brand preset missing');
    const tokens = resolveActivityTokens(brand);
    expect(tokens['--activity-agent-from']).toBe('hsl(220 90% 55%)');
    expect(tokens['--activity-agent-to']).toBe('hsl(220 90% 55%)');
    expect(tokens['--activity-agent-via']).toBeNull();
    expect(tokens['--activity-agent-ramp']).toBe(
      'hsl(220 90% 55%), hsl(263 70% 55%), hsl(347 75% 55%), hsl(220 90% 55%)',
    );
    // A single-colour fallback for any consumer that only wants one value.
    expect(tokens['--activity-agent']).toBe('hsl(220 90% 55%)');
  });

  it("Rainbow's ramp is exactly --rainbow-ramp's six stops, comma-joined, closing the loop", () => {
    const rainbow = ACTIVITY_PRESETS.rainbow;
    if (!rainbow) throw new Error('rainbow preset missing');
    const tokens = resolveActivityTokens(rainbow);
    expect(tokens['--activity-agent-ramp']).toBe('#f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ec4899, #f43f5e');
  });

  it('writes speed (with a unit) and intensity for every status', () => {
    const brand = ACTIVITY_PRESETS.brand;
    if (!brand) throw new Error('brand preset missing');
    const tokens = resolveActivityTokens(brand);
    expect(tokens['--activity-agent-speed']).toBe('4s');
    expect(tokens['--activity-waiting-intensity']).toBe('0');
  });

  it('activityTokenNames() names every property resolveActivityTokens can produce', () => {
    const brand = ACTIVITY_PRESETS.brand;
    if (!brand) throw new Error('brand preset missing');
    const tokens = resolveActivityTokens(brand);
    const names = new Set(activityTokenNames());
    for (const key of Object.keys(tokens)) {
      expect(names.has(key)).toBe(true);
    }
  });
});
