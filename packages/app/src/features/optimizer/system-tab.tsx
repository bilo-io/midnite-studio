import { TIMELINE_METRICS } from '../monitor/metric-geometry';
import { OptimizerMetrics } from './components/optimizer-metrics';

/**
 * The System tab — every metric the footer strip samples, over the
 * Optimizer's own 15-minute window.
 *
 * The Memory and GPU tabs each show *their* metric at the top of the surface
 * that already talks about it; this tab is the one place all four sit
 * together, which is the reading ("the GPU spiked while RAM was flat") that
 * needs them side by side. `TIMELINE_METRICS` is the shared list, so a
 * metric that becomes a level elsewhere in the app stops being charted here
 * in the same commit rather than a later one.
 */
export function SystemTab() {
  return (
    <div className="flex flex-col gap-4">
      <OptimizerMetrics metrics={TIMELINE_METRICS} showDisk title="System monitor" />
      <p className="text-xs text-muted-foreground">
        Sampled at the same cadence as the status bar&rsquo;s monitor — this view just keeps three
        times as much of it.
      </p>
    </div>
  );
}
