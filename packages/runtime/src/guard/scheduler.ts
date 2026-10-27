import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  resolveLoopDays,
  type LoopFrequency,
  type LoopSchedule,
  type LoopWeekday,
} from '@midnite/studio-shared';

const SECURITY_DIR = 'security';
const NEXT_WAKE_FILE = 'guard-next-wake.json';

const FREQUENCY_MS: Record<LoopFrequency, number> = {
  continuous: 60 * 1000,
  '1m': 60 * 1000,
  '2m': 2 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

const DAY_INDICES: Record<LoopWeekday, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Calculates the next wake timestamp (ms since epoch) for a given LoopSchedule,
 * or null if the schedule is disabled.
 */
export function calculateNextWake(schedule: LoopSchedule, fromTimeMs: number): number | null {
  if (!schedule.enabled) return null;

  const cadenceMs = FREQUENCY_MS[schedule.frequency ?? 'continuous'] ?? 60 * 1000;
  const allowedDays = new Set(resolveLoopDays(schedule.days).map((d) => DAY_INDICES[d]));

  const candidateMs = fromTimeMs + cadenceMs;

  const [fromH, fromM] = schedule.from.split(':').map((v) => parseInt(v, 10)) as [number, number];
  const [toH, toM] = schedule.to.split(':').map((v) => parseInt(v, 10)) as [number, number];
  const fromMinutes = fromH * 60 + fromM;
  const toMinutes = toH * 60 + toM;
  const hasWindow = fromMinutes !== toMinutes;
  const overnight = hasWindow && fromMinutes > toMinutes;

  const dayAllowed = (date: Date): boolean => allowedDays.has(date.getDay());
  const previousDay = (date: Date): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    return d;
  };

  // An overnight window belongs to the day it opens on: Mon 22:00-06:00 includes Tue 02:00, and it is Monday's
  // membership in `days` that decides whether Tue 02:00 is inside it.
  const inWindow = (date: Date): boolean => {
    if (!hasWindow) return dayAllowed(date);
    const minutes = date.getHours() * 60 + date.getMinutes();
    if (!overnight) return dayAllowed(date) && minutes >= fromMinutes && minutes < toMinutes;
    if (minutes >= fromMinutes) return dayAllowed(date);
    if (minutes < toMinutes) return dayAllowed(previousDay(date));
    return false;
  };

  const candidate = new Date(candidateMs);
  if (inWindow(candidate)) return candidateMs;

  // Otherwise the next time a window opens on an allowed day (midnight when there is no window).
  for (let dayOffset = 0; dayOffset < 15; dayOffset += 1) {
    const opens = new Date(candidateMs);
    opens.setDate(opens.getDate() + dayOffset);
    if (hasWindow) opens.setHours(fromH, fromM, 0, 0);
    else opens.setHours(0, 0, 0, 0);
    if (opens.getTime() > candidateMs && dayAllowed(opens)) return opens.getTime();
  }
  return candidateMs;
}

export interface NextWakeStore {
  load(): Promise<number | null>;
  save(nextWake: number | null): Promise<void>;
}

export function createFileNextWakeStore(userData: string): NextWakeStore {
  const filePath = join(userData, SECURITY_DIR, NEXT_WAKE_FILE);

  return {
    async load(): Promise<number | null> {
      try {
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as { nextWake?: unknown };
        return typeof parsed.nextWake === 'number' ? parsed.nextWake : null;
      } catch {
        return null;
      }
    },

    async save(nextWake: number | null): Promise<void> {
      try {
        await mkdir(join(userData, SECURITY_DIR), { recursive: true, mode: 0o700 });
        await writeFile(filePath, JSON.stringify({ nextWake }, null, 2) + '\n', 'utf8');
      } catch {
        // Ignore write failures in test or read-only environments
      }
    },
  };
}

export interface GuardSchedulerOptions {
  getSchedule: () => LoopSchedule | Promise<LoopSchedule>;
  onSweep: () => Promise<unknown>;
  userData?: string;
  store?: NextWakeStore;
  now?: () => number;
}

export interface GuardScheduler {
  start(): Promise<void>;
  stop(): void;
  sweepNow(): Promise<void>;
  getNextWake(): number | null;
}

/**
 * Creates the main-side scheduler for Guard sweeps (Phase 122 Theme A).
 *
 * Runs independent of whether an agent or pty is active, persisting `nextWake`
 * to disk so reloads and restarts resume without missing a cycle.
 */
export function createGuardScheduler(options: GuardSchedulerOptions): GuardScheduler {
  const now = options.now ?? (() => Date.now());
  const store = options.store ?? (options.userData ? createFileNextWakeStore(options.userData) : {
    load: async () => null,
    save: async () => {},
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentNextWake: number | null = null;
  let running = false;

  async function scheduleNext(): Promise<void> {
    if (!running) return;

    const schedule = await options.getSchedule();
    if (!schedule.enabled) {
      currentNextWake = null;
      await store.save(null);
      if (timer) clearTimeout(timer);
      timer = null;
      return;
    }

    const calculated = calculateNextWake(schedule, now());
    currentNextWake = calculated;
    await store.save(calculated);

    if (timer) clearTimeout(timer);
    timer = null;

    if (calculated !== null) {
      const delayMs = Math.max(0, calculated - now());
      // Max setTimeout in Node.js is 2147483647 ms (~24.8 days)
      const cappedDelay = Math.min(delayMs, 2147483647);
      timer = setTimeout(() => {
        void triggerSweep();
      }, cappedDelay);
    }
  }

  let sweeping: Promise<void> | null = null;
  function runSweep(): Promise<void> {
    if (sweeping) return sweeping;
    sweeping = (async () => {
      try {
        await options.onSweep();
      } catch {
        // Sweep failure handled gracefully
      }
    })().finally(() => {
      sweeping = null;
    });
    return sweeping;
  }

  async function triggerSweep(): Promise<void> {
    await runSweep();
    await scheduleNext();
  }

  return {
    async start(): Promise<void> {
      if (timer) clearTimeout(timer);
      timer = null;
      running = true;
      const schedule = await options.getSchedule();
      if (!schedule.enabled) {
        currentNextWake = null;
        await store.save(null);
        return;
      }

      // Check persisted next wake
      const persisted = await store.load();
      const currentNow = now();

      if (persisted !== null && persisted > currentNow) {
        // Next wake from previous run survives reload
        currentNextWake = persisted;
        const delayMs = Math.max(0, persisted - currentNow);
        timer = setTimeout(() => {
          void triggerSweep();
        }, delayMs);
      } else {
        // Due now or fresh start
        await triggerSweep();
      }
    },

    stop(): void {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    async sweepNow(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await runSweep();
      if (running) {
        await scheduleNext();
      }
    },

    getNextWake(): number | null {
      return currentNextWake;
    },
  };
}
