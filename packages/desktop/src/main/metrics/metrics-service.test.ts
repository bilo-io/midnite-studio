import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetricSample } from '@midnite/studio-shared';

import { DISK_REFRESH_EVERY_TICKS, createMetricsService } from './metrics-service';

/** A probe set that answers instantly and counts how often it was asked. */
function stubProbes() {
  const calls = { cpu: 0, memory: 0, gpu: 0, disk: 0, battery: 0 };
  return {
    calls,
    probes: {
      cpu: () => {
        calls.cpu += 1;
        return { usage: 42, cores: 8 };
      },
      memory: async () => {
        calls.memory += 1;
        return { percent: 55, used: 8, total: 16 };
      },
      gpu: async () => {
        calls.gpu += 1;
        return 12;
      },
      disk: async () => {
        calls.disk += 1;
        return { percent: 70, used: 7, total: 10 };
      },
      battery: async () => {
        calls.battery += 1;
        return {
          percent: 85,
          isCharging: true,
          isFullyCharged: false,
          hasBattery: true,
          devices: [{ id: 'internal', name: 'Computer', type: 'internal' as const, percent: 85 }],
        };
      },
    },
  };
}

describe('createMetricsService', () => {
  let samples: MetricSample[];

  beforeEach(() => {
    vi.useFakeTimers();
    samples = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const build = (overrides?: Parameters<typeof createMetricsService>[0]['probes']) =>
    createMetricsService({
      emit: (sample) => samples.push(sample),
      probes: overrides,
      now: () => 1_700_000_000_000,
    });

  it('emits immediately on start rather than waiting a whole interval', async () => {
    const { probes } = stubProbes();
    build(probes).start(5_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.battery?.percent).toBe(85);
  });

  it('re-arms the single timer on a cadence change instead of adding a second', async () => {
    const { probes, calls } = stubProbes();
    const service = build(probes);

    service.start(5_000);
    await vi.advanceTimersByTimeAsync(0);
    service.start(2_000);
    await vi.advanceTimersByTimeAsync(0);
    const afterStarts = calls.cpu;

    // Ten seconds at 2s is five ticks. Two stacked timers would give more.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.cpu - afterStarts).toBe(5);
  });

  it('collapses a tick that arrives while probes are still running', async () => {
    let resolveGpu: ((value: number) => void) | undefined;
    const { probes, calls } = stubProbes();
    const service = build({
      ...probes,
      gpu: () => {
        calls.gpu += 1;
        return new Promise<number>((resolve) => {
          resolveGpu = resolve;
        });
      },
    });

    service.start(1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.gpu).toBe(1);

    // Three intervals pass with the first probe still outstanding. Without the
    // in-flight guard this would be four concurrent `ioreg` subprocesses.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(calls.gpu).toBe(1);

    resolveGpu?.(12);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.gpu).toBe(2);
  });

  it(`reads disk once every ${DISK_REFRESH_EVERY_TICKS} ticks, not every tick`, async () => {
    const { probes, calls } = stubProbes();
    const service = build(probes);
    service.start(1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.disk).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000 * (DISK_REFRESH_EVERY_TICKS - 1));
    expect(calls.disk).toBe(1);
    expect(calls.cpu).toBe(DISK_REFRESH_EVERY_TICKS);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.disk).toBe(2);
  });

  it('carries the last disk reading through the ticks that did not measure it', async () => {
    const { probes } = stubProbes();
    build(probes).start(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    // Every sample carries disk, even though only the first tick read it.
    expect(samples.length).toBeGreaterThan(1);
    for (const sample of samples) expect(sample.disk).toBe(70);
  });

  it('forces a fresh disk read when the flyout opens', async () => {
    const { probes, calls } = stubProbes();
    const service = build(probes);
    service.start(5_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.disk).toBe(1);

    service.start(2_000, { freshDisk: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.disk).toBe(2);
  });

  it('omits a metric the machine cannot report, rather than sending zero', async () => {
    const { probes } = stubProbes();
    build({ ...probes, gpu: async () => undefined }).start(5_000);
    await vi.advanceTimersByTimeAsync(0);

    const sample = samples[0]!;
    expect('gpu' in sample).toBe(false);
    expect(sample.cpu).toBe(42);
  });

  it('stops sampling on pause and resumes at the cadence that was in force', async () => {
    const { probes, calls } = stubProbes();
    const service = build(probes);
    service.start(1_000);
    await vi.advanceTimersByTimeAsync(0);
    const before = calls.cpu;

    service.pause();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.cpu).toBe(before);
    expect(service.running).toBe(false);

    service.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.cpu).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls.cpu).toBe(before + 3);
  });

  it('does not let a start while paused resurrect the spawns pausing exists to stop', async () => {
    const { probes, calls } = stubProbes();
    const service = build(probes);
    service.pause();
    service.start(1_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls.cpu).toBe(0);

    // …and the cadence it was asked for is what it comes back at.
    service.resume();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(calls.cpu).toBe(4);
  });

  it('stays stopped after stop(), even across a resume', async () => {
    const { probes, calls } = stubProbes();
    const service = build(probes);
    service.start(1_000);
    await vi.advanceTimersByTimeAsync(0);
    service.stop();
    const after = calls.cpu;

    service.resume();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.cpu).toBe(after);
  });

  it('clamps an out-of-range cadence rather than trusting the renderer', async () => {
    const { probes, calls } = stubProbes();
    const service = build(probes);
    // 10ms would be a fork bomb of `ioreg` subprocesses.
    service.start(10);
    await vi.advanceTimersByTimeAsync(0);
    const before = calls.cpu;
    await vi.advanceTimersByTimeAsync(999);
    expect(calls.cpu).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.cpu).toBe(before + 1);
  });
});
