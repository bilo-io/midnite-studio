import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { METRICS_ACTIVE_INTERVAL_MS, METRICS_IDLE_INTERVAL_MS } from '@midnite/studio-shared';

import { useMetricsStore } from '../../store/metrics-store';
import { useMetricsStream } from './use-metrics-stream';

/**
 * `MonitorCluster` and `BatterySegment` (Phase 38 Theme G) both call this hook
 * independently — a fix landed here because two real callers made a
 * one-subscription-per-caller bug visible: every sample pushed into the store
 * once per caller, corrupting `series` with same-timestamp duplicates that
 * `cadenceBreaks` silently skips over (`metric-path.ts`'s `previous <= 0`
 * guard). These tests stand in for both callers with two harness instances
 * rather than importing the real components, so the assertion is about the
 * hook's own contract — one push per sample, regardless of caller count —
 * not about either component's rendering.
 */
function installBridge() {
  const handlers: Array<(sample: unknown) => void> = [];
  const start = vi.fn();
  const stop = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    metrics: {
      start,
      stop,
      onSample: (handler: (sample: unknown) => void) => {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index >= 0) handlers.splice(index, 1);
        };
      },
    } as unknown as MidniteStudioBridge['metrics'],
  } as Partial<MidniteStudioBridge>;
  return { handlers, start, stop };
}

function Consumer({
  detailed = false,
  idleIntervalMs,
}: {
  detailed?: boolean;
  idleIntervalMs?: number;
}) {
  useMetricsStream({ detailed, ...(idleIntervalMs === undefined ? {} : { idleIntervalMs }) });
  return null;
}

describe('useMetricsStream — shared sample subscription (Theme G)', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useMetricsStore.getState().reset();
  });

  it('a single caller pushes one sample into the store once', () => {
    const { handlers } = installBridge();
    render(<Consumer />);

    handlers[0]?.({ at: 1000, cpu: 40 });

    expect(useMetricsStore.getState().series.cpu).toHaveLength(2); // seed + real
  });

  it('two simultaneous callers still push each sample only once', () => {
    const { handlers } = installBridge();
    render(
      <>
        <Consumer />
        <Consumer detailed />
      </>,
    );

    // One underlying subscription, not one per caller.
    expect(handlers).toHaveLength(1);

    handlers[0]?.({ at: 1000, cpu: 40 });
    handlers[0]?.({ at: 3000, cpu: 42 });

    // Two real samples in, two points in the series — not four.
    expect(useMetricsStore.getState().series.cpu).toHaveLength(3); // seed + 2 real
  });

  it('the subscription survives one of two callers unmounting', () => {
    const { handlers } = installBridge();
    const { rerender } = render(
      <>
        <Consumer />
        <Consumer detailed />
      </>,
    );

    rerender(<Consumer />);

    expect(handlers).toHaveLength(1);
    handlers[0]?.({ at: 1000, cpu: 40 });
    expect(useMetricsStore.getState().series.cpu).toHaveLength(2);
  });

  it('unmounting every caller tears the subscription down', () => {
    const { handlers } = installBridge();
    const { unmount } = render(<Consumer />);

    unmount();

    expect(handlers).toHaveLength(0);
  });
});

/**
 * The sampler's *lifetime*, ref-counted the same way the subscription above
 * is — the Optimizer's System charts (adhoc: optimizer polish) call this hook
 * and unmount on every tab switch, where the footer's two callers live for the
 * app's lifetime and never exposed this.
 *
 * `metrics.stop()` is not recoverable from the renderer: it sets `wanted =
 * false` in main and `resume()` re-arms only `if (wanted)`, while a still-
 * mounted footer's effect deps never change and so never re-`start()`. So the
 * assertion that matters is the negative one — one caller leaving must not
 * stop anything.
 */
describe('useMetricsStream — ref-counted sampler lifetime', () => {
  // Its own copy of the suite above's teardown: `cadenceRequests` is module
  // state, so a consumer left mounted by one case is a live request in the
  // next one.
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useMetricsStore.getState().reset();
  });

  it('one of two callers unmounting does NOT stop the sampler', () => {
    const { stop } = installBridge();
    const first = render(<Consumer />);
    render(<Consumer />);

    first.unmount();

    expect(stop).not.toHaveBeenCalled();
  });

  it('the last caller unmounting stops it', () => {
    const { stop } = installBridge();
    const { unmount } = render(<Consumer />);

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('the tightest requested cadence wins, so a second caller cannot slow the flyout down', () => {
    const { start } = installBridge();
    render(<Consumer detailed />);
    start.mockClear();

    // The Optimizer's charts, asking for the idle cadence while the flyout is
    // open and asking for the active one.
    render(<Consumer />);

    expect(start).toHaveBeenLastCalledWith(
      expect.objectContaining({ intervalMs: METRICS_ACTIVE_INTERVAL_MS, freshDisk: true }),
    );
  });

  it("a caller's own idleIntervalMs is honoured rather than replaced by the default", () => {
    const { start } = installBridge();
    render(<Consumer idleIntervalMs={12_000} />);

    expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ intervalMs: 12_000 }));
    expect(METRICS_IDLE_INTERVAL_MS).not.toBe(12_000);
  });

  it('a disabled caller withdraws its request without stopping a live one', () => {
    const { start, stop } = installBridge();
    render(<Consumer detailed />);
    start.mockClear();

    const { unmount } = render(<DisabledConsumer />);
    unmount();

    expect(stop).not.toHaveBeenCalled();
  });
});

function DisabledConsumer() {
  useMetricsStream({ enabled: false });
  return null;
}
