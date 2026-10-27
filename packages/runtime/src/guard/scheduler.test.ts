import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LoopSchedule } from '@midnite/studio-shared';

import { calculateNextWake, createGuardScheduler } from './scheduler';

describe('GuardScheduler (Phase 122 Theme A)', () => {
  let testDir: string;
  let simulatedTime: number;

  beforeEach(() => {
    testDir = join(tmpdir(), `guard-scheduler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    // 2026-10-22 10:00:00 UTC (Thursday)
    simulatedTime = new Date('2026-10-22T10:00:00.000Z').getTime();
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Cleaned up
    }
  });

  const activeSchedule: LoopSchedule = {
    enabled: true,
    from: '09:00',
    to: '17:00',
    frequency: 'hourly',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  };

  it('calculates next wake respecting cadence inside window', () => {
    const nextWake = calculateNextWake(activeSchedule, simulatedTime);
    expect(nextWake).toBeDefined();
    expect(nextWake).toBe(simulatedTime + 60 * 60 * 1000);
  });

  it('returns null when schedule is disabled', () => {
    const disabledSchedule: LoopSchedule = { ...activeSchedule, enabled: false };
    expect(calculateNextWake(disabledSchedule, simulatedTime)).toBeNull();
  });

  it('survives a reload by restoring persisted next-wake from disk', async () => {
    let sweepCount = 0;

    // Instance 1: start and simulate a future wake
    const scheduler1 = createGuardScheduler({
      userData: testDir,
      getSchedule: () => activeSchedule,
      onSweep: async () => {
        sweepCount += 1;
      },
      now: () => simulatedTime,
    });

    // Save a future wake into the store directly or let it calculate
    await scheduler1.start();
    const initialWake = scheduler1.getNextWake();
    expect(initialWake).toBeGreaterThan(simulatedTime);
    expect(sweepCount).toBe(1); // Ran initial sweep because no previous wake was saved

    scheduler1.stop();

    // Instance 2 (simulating app relaunch / reload):
    // Time advances by 5 minutes, still well before initialWake
    const reloadTime = simulatedTime + 5 * 60 * 1000;
    let sweepCount2 = 0;

    const scheduler2 = createGuardScheduler({
      userData: testDir,
      getSchedule: () => activeSchedule,
      onSweep: async () => {
        sweepCount2 += 1;
      },
      now: () => reloadTime,
    });

    await scheduler2.start();

    // Must NOT have run another sweep on start because initialWake was persisted and still in the future!
    expect(sweepCount2).toBe(0);
    // Preserves the persisted next wake
    expect(scheduler2.getNextWake()).toBe(initialWake);

    scheduler2.stop();
  });

  it('"Sweep now" triggers immediate sweep and schedules next wake', async () => {
    let sweepCount = 0;
    const scheduler = createGuardScheduler({
      userData: testDir,
      getSchedule: () => activeSchedule,
      onSweep: async () => {
        sweepCount += 1;
      },
      now: () => simulatedTime,
    });

    await scheduler.start();
    expect(sweepCount).toBe(1);

    await scheduler.sweepNow();
    expect(sweepCount).toBe(2);
    expect(scheduler.getNextWake()).toBeGreaterThan(simulatedTime);

    scheduler.stop();
  });
});

describe('calculateNextWake overnight windows (Phase 122)', () => {
  // Local-time dates: 2026-10-26 is a Monday.
  const at = (day: number, h: number, m = 0): number => new Date(2026, 9, day, h, m).getTime();
  const overnight: LoopSchedule = { enabled: true, from: '22:00', to: '06:00', frequency: 'hourly', days: ['mon'] };

  it('stays inside the window across midnight when the opening day is allowed', () => {
    expect(calculateNextWake(overnight, at(26, 23, 30))).toBe(at(27, 0, 30)); // Mon 23:30 -> Tue 00:30
  });

  it('attributes the small hours to the previous day: Tue 02:00 is inside Monday\'s window', () => {
    expect(calculateNextWake(overnight, at(27, 1, 0))).toBe(at(27, 2, 0));
  });

  it('does not wake in the small hours of an allowed day whose previous day is not', () => {
    // Mon 04:00 belongs to Sunday's window, and Sunday is not allowed: wait for Mon 22:00.
    expect(calculateNextWake(overnight, at(26, 3, 0))).toBe(at(26, 22, 0));
  });

  it('opens at the window start after the gap', () => {
    expect(calculateNextWake(overnight, at(26, 10, 0))).toBe(at(26, 22, 0));
  });

  it('skips to the next allowed day when this one is not', () => {
    expect(calculateNextWake(overnight, at(27, 12, 0))).toBe(at(33, 22, 0)); // next Monday, Nov 2
  });
});

describe('GuardScheduler.reschedule / onError (Phase 122)', () => {
  const schedule: LoopSchedule = { enabled: true, from: '00:00', to: '00:00', frequency: 'hourly', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] };

  it('recomputes the wake from the new schedule instead of reusing the persisted one', async () => {
    const now = Date.now();
    let saved: number | null = now + 24 * 60 * 60 * 1000;
    const scheduler = createGuardScheduler({
      getSchedule: () => schedule,
      onSweep: async () => undefined,
      store: { load: async () => saved, save: async (v) => void (saved = v) },
      now: () => now,
    });
    await scheduler.start();
    expect(scheduler.getNextWake()).toBe(now + 24 * 60 * 60 * 1000);
    await scheduler.reschedule();
    expect(scheduler.getNextWake()).toBe(now + 60 * 60 * 1000);
    scheduler.stop();
  });

  it('reports a failed sweep through onError', async () => {
    const errors: unknown[] = [];
    const scheduler = createGuardScheduler({
      getSchedule: () => ({ ...schedule, enabled: false }),
      onSweep: async () => {
        throw new Error('disk full');
      },
      onError: (e) => errors.push(e),
    });
    await scheduler.sweepNow();
    expect(errors).toHaveLength(1);
  });
});
