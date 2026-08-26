import { METRIC_IDS, type MetricId } from '@midnite/git-shared';

import { useMetricsStore } from '../../store/metrics-store';
import { formatUsage } from './format-bytes';
import { ChartLegend, MetricChart, type ChartSeries } from './metric-chart';
import { GAUGE_GEOMETRY } from './metric-geometry';
import { METRIC_LABELS, metricColor, metricFill } from './metric-palette';

/**
 * The panel behind the footer cluster: three timelines and a capacity gauge.
 *
 * **Disk is a gauge, not a fourth chart.** Capacity is flat for hours — an area
 * chart of it would draw a straight line and imply movement that is not there.
 * A bar says the one thing capacity has to say, and keeps "three charts"
 * meaning three charts.
 *
 * The charts are stacked separately rather than overlaid in one box. CPU, RAM
 * and GPU are unrelated quantities that happen to share a unit; drawing them
 * on one set of axes invites a comparison ("the GPU is above the CPU") that
 * means nothing.
 */
export function MonitorFlyout() {
  const series = useMetricsStore((state) => state.series);
  const latest = useMetricsStore((state) => state.latest);

  const timelines: MetricId[] = ['cpu', 'memory', 'gpu'];
  const present = timelines.filter((id) => series[id].length > 0);

  return (
    <div className="w-[300px] p-3">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        System
      </h2>

      {present.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">Waiting for the first sample…</p>
      ) : (
        <div className="space-y-3">
          {present.map((id) => (
            <section key={id}>
              <MetricChart
                label={`${METRIC_LABELS[id]} over the last five minutes`}
                series={[{ id, points: series[id] } satisfies ChartSeries]}
              />
              <ChartLegend
                entries={[
                  {
                    id,
                    value: latest?.[id] ?? null,
                    ...(id === 'memory' && latest?.memoryBytes
                      ? { detail: formatUsage(latest.memoryBytes.used, latest.memoryBytes.total) }
                      : {}),
                    ...(id === 'cpu' && latest?.cpuInfo
                      ? { detail: cpuDetail(latest.cpuInfo) }
                      : {}),
                  },
                ]}
              />
            </section>
          ))}
        </div>
      )}

      {/*
        Absent, not zero. A machine whose GPU counter is unreadable says so
        here rather than showing a flat line at the bottom of a chart — the
        same rule the contract's optional fields encode.
      */}
      {timelines.some((id) => series[id].length === 0) ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Not readable on this machine:{' '}
          {timelines
            .filter((id) => series[id].length === 0)
            .map((id) => METRIC_LABELS[id])
            .join(', ')}
        </p>
      ) : null}

      {latest?.disk === undefined ? null : (
        <section className="mt-3 border-t border-border pt-3">
          <div className="mb-1 flex items-baseline justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: metricColor('disk') }}
              />
              {METRIC_LABELS[METRIC_IDS[3]]}
            </span>
            <span className="tabular-nums">
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
        </section>
      )}

      <p
        className="mt-3 text-[10px] text-muted-foreground"
        style={{ borderTop: `1px solid ${metricFill('cpu', 0.15)}`, paddingTop: 8 }}
      >
        Sampling every 2s while this is open. A dashed rule marks where the
        interval changed.
      </p>
    </div>
  );
}

const cpuDetail = (info: { cores: number; load1?: number }): string =>
  info.load1 === undefined
    ? `${info.cores} cores`
    : `${info.cores} cores · load ${info.load1.toFixed(2)}`;
