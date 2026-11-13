import { describe, expect, it } from 'vitest';

import { GUARD_DEFAULT_SCHEDULE, parsePmsetBattery, shouldHoldSweep } from './sweep-gate';

const BATTERY = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t18%; discharging; 1:02 remaining present: true";
const AC = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t18%; charging; 1:02 remaining present: true";

describe('sweep gate (Phase 122 Theme H)', () => {
  it('parses pmset output', () => {
    expect(parsePmsetBattery(BATTERY)).toEqual({ onBattery: true, percent: 18 });
    expect(parsePmsetBattery(AC)).toEqual({ onBattery: false, percent: 18 });
    expect(parsePmsetBattery('')).toEqual({ onBattery: false, percent: null });
  });

  it('holds only when blurred and on battery below 20%', () => {
    const low = parsePmsetBattery(BATTERY);
    expect(shouldHoldSweep({ blurred: true, battery: low })).toBe(true);
    expect(shouldHoldSweep({ blurred: false, battery: low })).toBe(false);
    expect(shouldHoldSweep({ blurred: true, battery: parsePmsetBattery(AC) })).toBe(false);
    expect(shouldHoldSweep({ blurred: true, battery: { onBattery: true, percent: 20 } })).toBe(false);
    expect(shouldHoldSweep({ blurred: true, battery: { onBattery: true, percent: null } })).toBe(false);
  });

  it('defaults to daily and off', () => {
    expect(GUARD_DEFAULT_SCHEDULE).toMatchObject({ frequency: 'daily', enabled: false });
  });
});
