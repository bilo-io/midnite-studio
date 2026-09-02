import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

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

function Consumer({ detailed = false }: { detailed?: boolean }) {
  useMetricsStream({ detailed });
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
