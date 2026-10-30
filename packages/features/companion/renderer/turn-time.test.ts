import { describe, expect, it } from 'vitest';

import {
  daySeparatorLabel,
  formatTurnTime,
  formatTurnTitle,
  startsNewDay,
} from './turn-time';

/**
 * The thread's clock — the Phase 79 follow-up's third fix.
 *
 * Every case pins both the locale and "now", because that is the only way a
 * date test is worth running: a suite that read `Date.now()` would pass in the
 * afternoon and fail at 00:30, and one that let the platform choose a locale
 * would pass on this machine and fail in CI.
 *
 * `en-GB` throughout, so the 24-hour clock is a property of the fixture rather
 * than of whoever runs it — `formatTurnTime` itself passes no locale in
 * production, which is the point of it taking one.
 *
 * The instants are local-time literals (`2026-09-08T14:32:05`, no `Z`) because
 * "same day" is a local-midnight question and a UTC literal would make the
 * boundary cases depend on the runner's zone.
 */

const locale = 'en-GB';
const at = (iso: string): number => new Date(iso).getTime();

describe('formatTurnTime', () => {
  it('shows hours and minutes, and no seconds', () => {
    expect(formatTurnTime(at('2026-09-08T14:32:05'), locale)).toBe('14:32');
  });

  it('honours a 12-hour locale rather than forcing one clock', () => {
    expect(formatTurnTime(at('2026-09-08T14:32:05'), 'en-US')).toMatch(/^2:32\s?PM$/);
  });

  it('answers empty for a nonsense instant rather than "Invalid Date"', () => {
    expect(formatTurnTime(Number.NaN, locale)).toBe('');
  });
});

describe('formatTurnTitle', () => {
  it('carries the full date and the seconds the bubble omits', () => {
    const title = formatTurnTitle(at('2026-09-08T14:32:05'), locale);
    expect(title).toContain('8 September 2026');
    expect(title).toContain('14:32:05');
    expect(title).toContain('Tuesday');
  });

  it('answers empty for a nonsense instant', () => {
    expect(formatTurnTitle(Number.NaN, locale)).toBe('');
  });
});

describe('daySeparatorLabel', () => {
  const now = at('2026-09-08T09:00:00');

  it('names today and yesterday', () => {
    expect(daySeparatorLabel(at('2026-09-08T23:59:00'), { now, locale })).toBe('Today');
    expect(daySeparatorLabel(at('2026-09-07T00:01:00'), { now, locale })).toBe('Yesterday');
  });

  it('uses the weekday only inside the week, where it cannot mislead', () => {
    // Two days back is Sunday; six days back is Wednesday — both unambiguous.
    expect(daySeparatorLabel(at('2026-09-06T12:00:00'), { now, locale })).toBe('Sunday');
    expect(daySeparatorLabel(at('2026-09-02T12:00:00'), { now, locale })).toBe('Wednesday');
  });

  it('falls back to a date at a week, where a weekday would read as this week', () => {
    expect(daySeparatorLabel(at('2026-09-01T12:00:00'), { now, locale })).toBe('1 Sept 2026');
    expect(daySeparatorLabel(at('2026-06-14T12:00:00'), { now, locale })).toBe('14 Jun 2026');
  });

  it('compares local midnights, not elapsed hours', () => {
    // 23:50 yesterday to 00:10 today is twenty minutes and two calendar days.
    expect(daySeparatorLabel(at('2026-09-07T23:50:00'), { now, locale })).toBe('Yesterday');
    expect(daySeparatorLabel(at('2026-09-08T00:10:00'), { now, locale })).toBe('Today');
  });
});

describe('startsNewDay', () => {
  it('is true for the first turn, because its day is not yet on screen', () => {
    expect(startsNewDay(at('2026-09-08T09:00:00'), undefined)).toBe(true);
  });

  it('is false within a day and true across local midnight', () => {
    expect(startsNewDay(at('2026-09-08T23:59:00'), at('2026-09-08T00:01:00'))).toBe(false);
    // Twenty minutes apart, two days.
    expect(startsNewDay(at('2026-09-08T00:10:00'), at('2026-09-07T23:50:00'))).toBe(true);
  });

  it('does not invent a separator from a nonsense instant', () => {
    expect(startsNewDay(Number.NaN, at('2026-09-08T09:00:00'))).toBe(false);
  });
});
