import { type MetricId } from '@midnite/studio-shared';

import { formatUsage } from '../../monitor/format-bytes';
import { ChartLegend, MetricChart } from '../../monitor/metric-chart';
import { GAUGE_GEOMETRY, WIDE_CHART_GEOMETRY } from '../../monitor/metric-geometry';
import { METRIC_ICONS } from '../../monitor/metric-icons';
import { METRIC_LABELS, metricColor } from '../../monitor/metric-palette';
import { useMetricsStream } from '../../monitor/use-metrics-stream';
import { METRICS_LONG_WINDOW_MS, useMetricsStore } from '../../../store/metrics-store';
import { useUiStore } from '../../../store/ui-store';

/**
 * The System Monitor charts, inside the Optimizer.
 *
 * Same drawing as the footer flyout's — `MetricChart`, `ChartLegend`, the
 * metric palette — over `longSeries` rather than `series`, so the window is
 * `METRICS_LONG_WINDOW_MS` (15 minutes) instead of five. That is the whole
 * difference, and it is deliberately the *only* one: a second chart
 * implementation would be a second set of colours to keep in step, and a
 * user who recognises the blue line in the footer has to recognise it here.
 *
 * `useMetricsStream()` is called here rather than relied on from the status
 * bar. The Optimizer detaches into its own window (`PageDetachMark`), and a
 * detached window has no footer at all — without this the charts would sit
 * empty forever in exactly the window someone opened to watch them. The
 * stream is a ref-counted singleton, so calling it from a second place costs
 * one refcount and pushes no duplicate samples.
 */

const WINDOW_LABEL = `${Math.round(METRICS_LONG_WINDOW_MS / 60_000)} minutes`;

export function OptimizerMetrics({
  metrics,
  showDisk = false,
  compact = false,
  title,
}: {
  /** Which timeline metrics to chart, in the order they should be read. */
  metrics: readonly MetricId[];
  /** Disk is a level, not a rate — it gets the flyout's capacity bar, never a chart. */
  showDisk?: boolean;
  /** The Smart Scan strip: charts side by side at a third of the height. */
  compact?: boolean;
  title?: string;
}) {
  // The same persisted cadence the footer asks for — not the bare default,
  // which would quietly override the user's setting for as long as this tab
  // is open. `detailed` stays false: these charts cover fifteen minutes, so a
  // 2s tick buys them nothing the footer's flyout does not already pay for.
  const idleIntervalMs = useUiStore((state) => state.metricsIdleIntervalMs);
  useMetricsStream({ idleIntervalMs });
  const longSeries = useMetricsStore((state) => state.longSeries);
  const latest = useMetricsStore((state) => state.latest);

  // A metric this machine cannot read draws nothing at all, exactly as the
  // flyout does — an empty box with a label is a control implying something
  // is temporarily wrong.
  const present = metrics.filter((id) => longSeries[id].length > 0);
  const absent = metrics.filter((id) => longSeries[id].length === 0);

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title ?? 'System'}
        </h2>
        <span className="text-[10px] text-muted-foreground">last {WINDOW_LABEL}</span>
      </div>

      {/*
        Absent, not waiting. Once a sample has arrived, a metric with no points
        is one this machine cannot read — a GPU-less machine on the GPU tab
        would otherwise sit at "Waiting for the first sample…" forever, which
        is the exact failure the flyout's own copy exists to avoid.
      */}
      {present.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          {latest === null
            ? 'Waiting for the first sample…'
            : `Not readable on this machine: ${metrics.map((id) => METRIC_LABELS[id]).join(', ')}`}
        </p>
      ) : (
        // Compact lays the charts out by how many there are — a fixed
        // three-column grid leaves a hole beside a two-metric strip, which
        // reads as a chart that failed to render.
        <div
          className={compact ? 'grid gap-3' : 'flex flex-col gap-3'}
          style={
            compact
              ? { gridTemplateColumns: `repeat(${Math.max(1, present.length)}, minmax(0, 1fr))` }
              : undefined
          }
        >
          {present.map((id) => (
            <div key={id}>
              <MetricChart
                label={`${METRIC_LABELS[id]} over the last ${WINDOW_LABEL}`}
                geometry={WIDE_CHART_GEOMETRY}
                series={[{ id, points: longSeries[id] }]}
                className={compact ? 'h-10 w-full' : 'h-24 w-full'}
              />
              <ChartLegend
                entries={[
                  {
                    id,
                    value: latest?.[id] ?? null,
                    ...(id === 'memory' && latest?.memoryBytes
                      ? { detail: formatUsage(latest.memoryBytes.used, latest.memoryBytes.total) }
                      : {}),
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {absent.length > 0 && present.length > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          Not readable on this machine: {absent.map((id) => METRIC_LABELS[id]).join(', ')}
        </p>
      ) : null}

      {showDisk && latest?.disk !== undefined ? (
        <div className="mt-1 border-t border-border pt-2">
          <div className="mb-1 flex items-baseline justify-between text-[10px]">
            <span className="flex items-center gap-1" style={{ color: metricColor('disk') }}>
              <METRIC_ICONS.disk aria-hidden className="h-3 w-3 shrink-0" />
              {METRIC_LABELS.disk}
            </span>
            <span className="tabular-nums" style={{ color: metricColor('disk') }}>
              {latest.diskBytes
                ? formatUsage(latest.diskBytes.used, latest.diskBytes.total)
                : `${Math.round(latest.disk)}%`}
            </span>
          </div>
          <div
            role="meter"
            aria-valuenow={Math.round(latest.disk)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Disk capacity used"
            className="w-full overflow-hidden bg-muted"
            style={{ height: GAUGE_GEOMETRY.height, borderRadius: GAUGE_GEOMETRY.radius }}
          >
            <div
              className="h-full"
              style={{
                width: `${latest.disk}%`,
                backgroundColor: metricColor('disk'),
                borderRadius: GAUGE_GEOMETRY.radius,
              }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
