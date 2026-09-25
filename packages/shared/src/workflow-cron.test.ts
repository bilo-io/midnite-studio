import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isValidCronExpression, nextCronFireTimes, parseCronExpression } from './workflow-cron';

describe('parseCronExpression', () => {
  it('accepts a bare wildcard schedule', () => {
    expect(parseCronExpression('* * * * *')).not.toBeNull();
  });

  it('accepts steps, ranges, lists and combinations', () => {
    expect(parseCronExpression('*/15 9-17 1,15 * 1-5')).not.toBeNull();
  });

  it('rejects a field count other than five', () => {
    expect(parseCronExpression('* * * *')).toBeNull();
    expect(parseCronExpression('* * * * * *')).toBeNull();
  });

  it('rejects an out-of-range value', () => {
    expect(parseCronExpression('60 * * * *')).toBeNull(); // minute has no 60
    expect(parseCronExpression('* 24 * * *')).toBeNull(); // hour has no 24
    expect(parseCronExpression('* * 32 * *')).toBeNull(); // no 32nd day
    expect(parseCronExpression('* * * 13 *')).toBeNull(); // no 13th month
    expect(parseCronExpression('* * * * 7')).toBeNull(); // day-of-week is 0-6
  });

  it('rejects garbage', () => {
    expect(parseCronExpression('not a cron')).toBeNull();
    expect(parseCronExpression('* * * * a-b')).toBeNull();
    expect(parseCronExpression('* * * * ,')).toBeNull();
  });

  it('isValidCronExpression mirrors parseCronExpression', () => {
    expect(isValidCronExpression('0 9 * * *')).toBe(true);
    expect(isValidCronExpression('0 9 * *')).toBe(false);
  });
});

describe('nextCronFireTimes', () => {
  it('returns the requested count of fire times, strictly after `from`, in order', () => {
    const from = new Date(2024, 0, 1, 8, 0, 0).getTime(); // Jan 1 2024, 08:00
    const fires = nextCronFireTimes('0 9 * * *', from, 3);
    expect(fires).toHaveLength(3);
    expect(fires[0]).toBe(new Date(2024, 0, 1, 9, 0, 0).getTime());
    expect(fires[1]).toBe(new Date(2024, 0, 2, 9, 0, 0).getTime());
    expect(fires[2]).toBe(new Date(2024, 0, 3, 9, 0, 0).getTime());
  });

  it('never returns `from` itself even when it exactly matches the schedule', () => {
    const from = new Date(2024, 0, 1, 9, 0, 0).getTime();
    const [first] = nextCronFireTimes('0 9 * * *', from, 1);
    expect(first).toBe(new Date(2024, 0, 2, 9, 0, 0).getTime());
  });

  it('returns an empty array for an unparsable cron', () => {
    expect(nextCronFireTimes('nonsense', Date.now(), 3)).toEqual([]);
  });

  it('applies the day-of-month/day-of-week OR rule when both are restricted', () => {
    // The 15th OR a Friday — not "the 15th and also a Friday".
    const from = new Date(2024, 0, 1, 0, 0, 0).getTime();
    const fires = nextCronFireTimes('0 12 15 * 5', from, 5);
    for (const ts of fires) {
      const d = new Date(ts);
      expect(d.getDate() === 15 || d.getDay() === 5).toBe(true);
    }
    // Both a match on the 15th (whatever weekday it lands on) and a plain
    // Friday appear, proving this is OR rather than AND.
    expect(fires.some((ts) => new Date(ts).getDate() === 15)).toBe(true);
    expect(fires.some((ts) => new Date(ts).getDay() === 5 && new Date(ts).getDate() !== 15)).toBe(true);
  });

  it('terminates on an impossible date (February 30th) rather than hanging, returning nothing', () => {
    const from = new Date(2024, 0, 1).getTime();
    expect(nextCronFireTimes('0 0 30 2 *', from, 3)).toEqual([]);
  });

  describe('month rollover', () => {
    it('rolls a monthly schedule over a leap-year February', () => {
      const from = new Date(2024, 0, 15, 0, 0, 0).getTime(); // Jan 15 2024 (leap year)
      const fires = nextCronFireTimes('0 0 1 * *', from, 3);
      expect(fires).toEqual([
        new Date(2024, 1, 1).getTime(),
        new Date(2024, 2, 1).getTime(),
        new Date(2024, 3, 1).getTime(),
      ]);
    });

    it('skips months that have no 31st day', () => {
      const from = new Date(2024, 0, 25, 0, 0, 0).getTime(); // Jan 25 2024
      const fires = nextCronFireTimes('0 0 31 * *', from, 3);
      // Jan 31 already passed `from`'s search-forward point? `from` is Jan 25,
      // so Jan 31 is still ahead of it — then Feb/Apr have no 31st, so the
      // sequence skips straight from Jan 31 to Mar 31 to May 31.
      expect(fires).toEqual([
        new Date(2024, 0, 31).getTime(),
        new Date(2024, 2, 31).getTime(),
        new Date(2024, 4, 31).getTime(),
      ]);
    });
  });

  describe('DST (America/New_York)', () => {
    const originalTz = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = 'America/New_York';
    });

    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    it('skips the wall-clock hour that spring-forward removes (2024-03-10)', () => {
      // 2024-03-10: clocks jump 01:59:59 -> 03:00:00 local. A 02:00 daily
      // cron has nothing to fire on that calendar date.
      const from = new Date(2024, 2, 8, 0, 0, 0).getTime(); // March 8, 2024
      const fires = nextCronFireTimes('0 2 * * *', from, 4);
      const datesPresent = fires.map((ts) => new Date(ts).getDate());
      expect(datesPresent).not.toContain(10);
      expect(datesPresent).toEqual(expect.arrayContaining([9, 11, 12]));
      for (const ts of fires) {
        expect(new Date(ts).getHours()).toBe(2);
      }
    });

    it('does not naively add 24h across the fall-back transition (2024-11-03)', () => {
      // 2024-11-03: clocks fall back 01:59:59 (DST) -> 01:00:00 (standard).
      // The gap in real elapsed time between two 01:30 local fires spanning
      // that night is 25 hours, not the usual 24.
      const from = new Date(2024, 10, 1, 0, 0, 0).getTime(); // Nov 1, 2024
      const fires = nextCronFireTimes('30 1 * * *', from, 4);
      expect(fires.length).toBe(4);
      const gaps: number[] = [];
      for (let i = 1; i < fires.length; i += 1) gaps.push(fires[i]! - fires[i - 1]!);
      // Every gap is a plain 24h except the one that crosses the fall-back
      // night, which is a full hour longer.
      const oddGaps = gaps.filter((g) => g !== 24 * 60 * 60 * 1000);
      expect(oddGaps).toEqual([25 * 60 * 60 * 1000]);
    });
  });
});
