import {
  METRICS_ACTIVE_INTERVAL_MS,
  METRICS_IDLE_INTERVAL_MS,
} from '@midnite/studio-shared';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { useEffect, useMemo } from 'react';

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
 * Every live caller's requested cadence, keyed by that caller's own token.
 *
 * The sampler's *lifetime* is ref-counted for the same reason its subscription
 * is (above), and the bug is worse: `metrics.stop()` sets `wanted = false` in
 * main (`metrics-service.ts`), and `resume()` re-arms only `if (wanted)` — so
 * one caller unmounting used to stop sampling for the whole app, permanently,
 * with the footer still mounted and its own effects' deps unchanged so it
 * never issued a fresh `start()`. That was survivable while both callers lived
 * for the app's lifetime; the Optimizer's System charts unmount on every tab
 * switch, which is what made it real.
 *
 * The map holds the request rather than a count, because callers disagree
 * about cadence: the **tightest** interval wins, which is the only answer that
 * cannot starve a caller. An open flyout asking for 2s is not downgraded by
 * something else mounting and asking for 5s.
 */
const cadenceRequests = new Map<symbol, { intervalMs: number; freshDisk: boolean }>();

/** Reconcile main against every live request — or stop, if there are none. */
function applyCadence(api: MidniteStudioBridge): void {
  if (cadenceRequests.size === 0) {
    api.metrics.stop();
    return;
  }
  let intervalMs = Number.POSITIVE_INFINITY;
  let freshDisk = false;
  for (const request of cadenceRequests.values()) {
    intervalMs = Math.min(intervalMs, request.intervalMs);
    freshDisk = freshDisk || request.freshDisk;
  }
  api.metrics.start({ intervalMs, ...(freshDisk ? { freshDisk: true } : {}) });
}

/**
 * Drive the metrics stream.
 *
 * Three effects, deliberately split — the `use-graph-stream.ts` pattern, for the
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
  /** This caller's identity in `cadenceRequests`, stable for its lifetime. */
  const token = useMemo(() => Symbol('metrics-stream'), []);
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
      // Withdraw this caller's request rather than stopping outright: another
      // caller may still want samples, and `stop()` is not something one
      // component gets to decide for the app.
      cadenceRequests.delete(token);
      applyCadence(api);
      return;
    }

    cadenceRequests.set(token, {
      intervalMs: detailed ? METRICS_ACTIVE_INTERVAL_MS : idleIntervalMs,
      // Opening the flyout is the one moment a stale capacity figure becomes
      // visible — the gauge shows it precisely enough to notice.
      freshDisk: detailed,
    });
    applyCadence(api);

    // No cleanup: this effect re-runs on every cadence change, and withdrawing
    // the request there would flap through a stopped state whenever this is
    // the only caller. `start` re-arms rather than stacking, and the sampler
    // stops itself on window blur — see metrics-service.ts.
  }, [enabled, detailed, idleIntervalMs, token]);

  // Withdrawal is tied to *this* caller unmounting, and stops main only when
  // it was the last one. Kept separate from the cadence effect above so a
  // cadence change never passes through a stopped state.
  useEffect(() => {
    return () => {
      const api = bridge();
      cadenceRequests.delete(token);
      if (api) applyCadence(api);
    };
  }, [token]);
}
