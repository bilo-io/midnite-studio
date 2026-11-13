import { DEFAULT_LOOP_SCHEDULE, type LoopSchedule } from '@midnite/studio-shared';

/** Below this charge, on battery, a scheduled sweep waits for the window to be looked at or the Mac to be plugged in. */
export const LOW_BATTERY_PERCENT = 20;

export interface BatteryState {
  onBattery: boolean;
  /** 0 to 100, or null when it could not be read. */
  percent: number | null;
}

/**
 * Reads `pmset -g batt` output ("Now drawing from 'Battery Power'" then "... 54%; discharging; ...").
 * A Mac with no battery, or output that is not recognised, is plugged in: the gate then never holds a sweep.
 */
export function parsePmsetBattery(output: string): BatteryState {
  const onBattery = /drawing from 'Battery Power'/i.test(output);
  const match = /(\d{1,3})%/.exec(output);
  return { onBattery, percent: match ? Math.min(100, Number(match[1])) : null };
}

/**
 * A scheduled sweep is held while the window is blurred *and* the Mac is on battery below 20%. An unreadable
 * charge level counts as fine: a sweep is a few feed calls and a lockfile walk, not worth guessing about.
 */
export function shouldHoldSweep(input: { blurred: boolean; battery: BatteryState }): boolean {
  const { blurred, battery } = input;
  return blurred && battery.onBattery && battery.percent !== null && battery.percent < LOW_BATTERY_PERCENT;
}

/**
 * What Guard's schedule is until the user changes it: once a day, in a working-day window, on the first wake
 * after it is due. Off, because turning it on is what lets the feeds be called at all.
 */
export const GUARD_DEFAULT_SCHEDULE: LoopSchedule = { ...DEFAULT_LOOP_SCHEDULE, enabled: false, frequency: 'daily' };
