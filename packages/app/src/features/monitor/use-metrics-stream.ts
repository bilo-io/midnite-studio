import {
  METRICS_ACTIVE_INTERVAL_MS,
  METRICS_IDLE_INTERVAL_MS,
} from '@midnite/studio-shared';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useMetricsStore } from '../../store/metrics-store';

/**
 * The stream itself is a module-level singleton, ref-counted across callers.
 *
 * `useMetricsStream` has two callers — the footer's `MonitorCluster` and
 * `BatterySegment` — each mounted for the app's whole life, both wanting the
 * same live samples. Each subscribing independently means every real sample
 * gets pushed into `useMetricsStore` once per caller: harmless-looking for a
 * single reading (the store's `latest` just gets overwritten with the same
 * value twice), but it corrupts `series` — a sample logged twice lands as two
 * points at the same timestamp, a zero-width gap `cadenceBreaks` (Theme G)
 * skips over rather than draws a rule at, quietly eating the boundary it
 * exists to mark. One subscription shared by however many components are
 * asking is the fix, not a change to what either caller does.
 */
let sampleSubscribers = 0;
let unsubscribeSample: (() => void) | null = null;

function retainSampleSubscription(api: MidniteStudioBridge): () => void {
  sampleSubscribers += 1;
  if (sampleSubscribers === 1) {
    unsubscribeSample = api.metrics.onSample((sample) => {
      useMetricsStore.getState().push(sample);
    });
  }
  return () => {
    sampleSubscribers -= 1;
    if (sampleSubscribers === 0) {
      unsubscribeSample?.();
      unsubscribeSample = null;
    }
  };
}

/**
 * Drive the metrics stream.
 *
 * Two effects, deliberately split — the `use-graph-stream.ts` pattern, for the
 * same reason it exists there.
 *
 * The **subscription** effect has `[]` deps and writes through `getState()`
 * rather than a bound action. Re-subscribing when the cadence changes would
 * tear the listener down and rebuild it, and any sample that arrives across
 * that gap is simply lost — a hole in the middle of the chart with nothing
 * anywhere to say so. Writing imperatively is what lets the deps stay empty:
 * a `push` pulled out of the store with a selector is a new identity on every
 * render, and a subscription keyed on it re-subscribes constantly.
 *
 * The **cadence** effect owns start/stop. Cadence is a consequence of what is
 * on screen — the flyout opening escalates to 2s and closing drops back to 5s —
 * not a setting anyone configures, so it is derived from `detailed` here rather
 * than read from anywhere.
 */
export function useMetricsStream(
  options: { enabled?: boolean; detailed?: boolean; idleIntervalMs?: number } = {},
): void {
  const enabled = options.enabled ?? true;
  const detailed = options.detailed ?? false;
  // Clamped in main regardless, so a stale persisted value cannot ask for a
  // cadence the sampler will not honour.
  const idleIntervalMs = options.idleIntervalMs ?? METRICS_IDLE_INTERVAL_MS;

  useEffect(() => {
    const api = bridge();
    if (!api) return;
    return retainSampleSubscription(api);
  }, []);

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    if (!enabled) {
      api.metrics.stop();
      return;
    }

    api.metrics.start({
      intervalMs: detailed ? METRICS_ACTIVE_INTERVAL_MS : idleIntervalMs,
      // Opening the flyout is the one moment a stale capacity figure becomes
      // visible — the gauge shows it precisely enough to notice.
      ...(detailed ? { freshDisk: true } : {}),
    });

    // No stop() on cleanup: this effect re-runs on every cadence change, and
    // stopping there would leave a window where main has no timer armed at all.
    // `start` re-arms rather than stacking, and the sampler stops itself on
    // window blur — see metrics-service.ts.
  }, [enabled, detailed, idleIntervalMs]);

  // Stopping is tied to the footer unmounting, which in practice is the app
  // closing. Kept separate from the cadence effect so a cadence change never
  // passes through a stopped state.
  useEffect(() => {
    if (!enabled) return;
    return () => {
      bridge()?.metrics.stop();
    };
  }, [enabled]);
}
