import {
  METRICS_IDLE_INTERVAL_MS,
  METRICS_MAX_INTERVAL_MS,
  METRICS_MIN_INTERVAL_MS,
  type BatteryReading,
  type MetricSample,
} from '@midnite/studio-shared';

import { createBatteryProbe } from './battery';
import { createCpuProbe, loadAverage1 } from './cpu';
import { probeDisk, type DiskReading } from './disk';
import { createGpuProbe } from './gpu';
import { probeMemory, type MemoryReading } from './memory';

/**
 * One sampler for the whole app.
 *
 * Three properties hold this together, and each of them is a bug that was
 * cheap to design out and expensive to notice later:
 *
 * 1. **One interval, however many subscribers.** The renderer can ask to start
 *    more than once — every cadence change is a fresh `start` — and each of
 *    those must re-arm the single timer, never add a second one. Two timers
 *    means two `ioreg` subprocesses per tick, forever, with nothing on screen
 *    to suggest it.
 *
 * 2. **`timer.unref()`.** A ref'd interval keeps the Node event loop alive, so
 *    the Electron main process would refuse to exit after the last window
 *    closed — the app would vanish from screen and stay in the process table.
 *
 * 3. **Concurrent probes collapse onto one in-flight promise.** `ioreg` under
 *    load can take longer than the 2s tick. Without the guard the next tick
 *    spawns another, they stack, and the machine's own monitor becomes the
 *    thing making it busy.
 *
 * Sampling **stops entirely on blur or hide**. Nobody reads a footer they
 * cannot see, and the alternative is an `ioreg` spawn every few seconds for the
 * whole time the app sits in the background.
 *
 * No `electron` import: the window lifecycle reaches this through
 * `pause()`/`resume()` calls made by the handler module, which keeps the whole
 * sampler runnable under bare vitest.
 */

/** Every probe, injectable so the tests never spawn a subprocess. */
export type MetricsProbes = {
  cpu: () => { usage: number | undefined; cores: number };
  memory: () => Promise<MemoryReading | undefined>;
  gpu: () => Promise<number | undefined>;
  disk: () => Promise<DiskReading | undefined>;
  battery: () => Promise<BatteryReading | undefined>;
};

/**
 * How many ticks between disk reads when nothing forces one.
 *
 * Capacity barely moves, but a footer percentage that is only correct after
 * the user opens a flyout would be a readout nobody could trust at a glance.
 * A coarse background refresh keeps it honest for one `statfs` per ~20–50s.
 */
export const DISK_REFRESH_EVERY_TICKS = 10;

/** Battery status changes slowly, probe every 2 ticks (approx 4-10s). */
export const BATTERY_REFRESH_EVERY_TICKS = 2;

export type MetricsService = {
  /**
   * Start, or re-arm at a new cadence. Idempotent at the same interval, so a
   * duplicated call from a StrictMode double-mount is a no-op rather than a
   * second sampler.
   */
  start: (intervalMs: number, options?: { freshDisk?: boolean }) => void;
  stop: () => void;
  /** Window blurred or hid: hold the timer down without forgetting the cadence. */
  pause: () => void;
  /** Window focused again: re-arm at the cadence that was in force. */
  resume: () => void;
  /** True while a timer is armed — for the tests and for the resume decision. */
  readonly running: boolean;
};

export function createMetricsService(options: {
  emit: (sample: MetricSample) => void;
  probes?: Partial<MetricsProbes>;
  now?: () => number;
}): MetricsService {
  const now = options.now ?? Date.now;
  const probes = withDefaults(options.probes);

  let timer: ReturnType<typeof setInterval> | null = null;
  let intervalMs = METRICS_IDLE_INTERVAL_MS;
  let wanted = false;
  let paused = false;
  let inFlight: Promise<void> | null = null;
  let ticksSinceDisk = Number.POSITIVE_INFINITY;
  let lastDisk: DiskReading | undefined;
  let ticksSinceBattery = Number.POSITIVE_INFINITY;
  let lastBattery: BatteryReading | undefined;

  const arm = (): void => {
    disarm();
    if (!wanted || paused) return;
    timer = setInterval(() => void tick(), intervalMs);
    // Never hold the event loop open — see (2) above.
    timer.unref?.();
  };

  const disarm = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  /**
   * One reading. Re-entrant calls return the promise already in flight rather
   * than starting a second round of probes — see (3) above.
   */
  const tick = (forceDisk = false): Promise<void> => {
    inFlight ??= collect(forceDisk).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const collect = async (forceDisk: boolean): Promise<void> => {
    const { usage, cores } = probes.cpu();

    ticksSinceDisk += 1;
    ticksSinceBattery += 1;
    const wantDisk = forceDisk || ticksSinceDisk >= DISK_REFRESH_EVERY_TICKS;
    const wantBattery = ticksSinceBattery >= BATTERY_REFRESH_EVERY_TICKS;

    const [memory, gpu, disk, battery] = await Promise.all([
      probes.memory(),
      probes.gpu(),
      wantDisk ? probes.disk() : Promise.resolve(undefined),
      wantBattery ? probes.battery() : Promise.resolve(undefined),
    ]);

    if (wantDisk) {
      ticksSinceDisk = 0;
      // Only overwrite on a successful read: a transient `statfs` failure
      // should leave the last known capacity on screen rather than blank the
      // readout, since capacity is the one metric that genuinely has not moved.
      if (disk !== undefined) lastDisk = disk;
    }
    const diskReading = disk ?? lastDisk;

    if (wantBattery) {
      ticksSinceBattery = 0;
      if (battery !== undefined) lastBattery = battery;
    }
    const batteryReading = battery ?? lastBattery;

    const load1 = loadAverage1();

    /*
      Assembled key by key rather than with a spread of possibly-undefined
      values, because `exactOptionalPropertyTypes` is on: writing `cpu:
      undefined` is a type error against a `cpu?: number` field, and — more to
      the point — a present-but-undefined key is not the same thing as an
      absent one once it crosses structured clone.
    */
    const sample: MetricSample = { at: now() };
    if (usage !== undefined) sample.cpu = usage;
    if (memory !== undefined) {
      sample.memory = memory.percent;
      sample.memoryBytes = { used: memory.used, total: memory.total };
    }
    if (gpu !== undefined) sample.gpu = gpu;
    if (diskReading !== undefined) {
      sample.disk = diskReading.percent;
      sample.diskBytes = { used: diskReading.used, total: diskReading.total };
    }
    sample.cpuInfo = load1 === undefined ? { cores } : { cores, load1 };
    if (batteryReading !== undefined) {
      sample.battery = batteryReading;
    }

    options.emit(sample);
  };

  return {
    get running() {
      return timer !== null;
    },
    start(next, startOptions) {
      const clamped = Math.min(
        METRICS_MAX_INTERVAL_MS,
        Math.max(METRICS_MIN_INTERVAL_MS, Math.round(next)),
      );
      const cadenceChanged = clamped !== intervalMs;
      intervalMs = clamped;
      wanted = true;
      // Blur wins over a start: the renderer asking while the window is hidden
      // (a background re-render, a restored session) must not resurrect the
      // spawns that pausing exists to stop.
      if (!paused && (cadenceChanged || timer === null)) arm();
      // A fresh reading immediately, so opening the flyout paints a chart now
      // rather than at the next tick — up to five seconds away.
      if (!paused) void tick(startOptions?.freshDisk ?? false);
    },
    stop() {
      wanted = false;
      disarm();
    },
    pause() {
      paused = true;
      disarm();
    },
    resume() {
      paused = false;
      if (wanted) {
        arm();
        void tick();
      }
    },
  };
}

function withDefaults(overrides: Partial<MetricsProbes> | undefined): MetricsProbes {
  const cpuProbe = createCpuProbe();
  const gpuProbe = createGpuProbe();
  const batteryProbe = createBatteryProbe();
  return {
    cpu: overrides?.cpu ?? (() => cpuProbe.sample()),
    memory: overrides?.memory ?? (() => probeMemory()),
    gpu: overrides?.gpu ?? (() => gpuProbe.sample()),
    disk: overrides?.disk ?? (() => probeDisk()),
    battery: overrides?.battery ?? (() => batteryProbe.sample()),
  };
}
