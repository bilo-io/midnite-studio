import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHeapReport, startHeapSampler } from './heap-sampler';

describe('heap sampler (Phase 45 Theme A)', () => {
  it('logs one line per report, in the format memory-report.mjs parses', () => {
    const lines: string[] = [];
    const report = createHeapReport({
      processName: 'main',
      log: (m) => lines.push(m),
      sample: () => ({
        rss: 100 * 1024 * 1024,
        heapUsed: 40 * 1024 * 1024,
        heapTotal: 60 * 1024 * 1024,
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }),
    });

    report();

    expect(lines).toEqual([
      '[perf] main heap rss=100 heapUsed=40 heapTotal=60 external=5 arrayBuffers=2',
    ]);
  });

  it('labels the broker distinctly from main', () => {
    const lines: string[] = [];
    const report = createHeapReport({
      processName: 'broker',
      log: (m) => lines.push(m),
      sample: () => ({ rss: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 }),
    });

    report();

    expect(lines[0]).toMatch(/^\[perf\] broker heap /);
  });

  describe('startHeapSampler', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is a true no-op with the flag unset — nothing is ever scheduled', () => {
      const lines: string[] = [];
      startHeapSampler({
        enabled: false,
        processName: 'main',
        log: (m) => lines.push(m),
        sample: () => {
          throw new Error('sampled while heap sampling is disabled');
        },
      });

      vi.advanceTimersByTime(60_000);

      expect(lines).toEqual([]);
    });

    it('reports on an interval once enabled, and the interval does not keep the process alive', () => {
      const lines: string[] = [];
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      startHeapSampler({
        enabled: true,
        processName: 'broker',
        log: (m) => lines.push(m),
        sample: () => ({ rss: 1024 * 1024, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0 }),
        intervalMs: 1_000,
      });

      const timer = setIntervalSpy.mock.results[0]?.value as { hasRef?: () => boolean };
      // `unref()` was called — a fake timer still reports `hasRef() === false` after it.
      expect(timer?.hasRef?.()).toBe(false);

      vi.advanceTimersByTime(3_500);

      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('rss=1');
    });
  });
});
