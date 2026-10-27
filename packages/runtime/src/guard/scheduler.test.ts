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
