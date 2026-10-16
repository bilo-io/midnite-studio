import {
  ChartLegend,
  formatUsage,
  METRIC_LABELS,
  MetricChart,
  TIMELINE_METRICS,
  useMetricsStore,
  type ChartSeries,
} from '@midnite/studio-frame';

const cpuDetail = (info: { cores: number; load1?: number }): string =>
  info.load1 === undefined ? `${info.cores} cores` : `${info.cores} cores · load ${info.load1.toFixed(2)}`;

/**
 * CPU, RAM and GPU as three stacked timelines — separate charts, never
 * overlaid: they are unrelated quantities that happen to share a unit, and one
 * set of axes invites a comparison that means nothing. A metric the machine
 * cannot read is named, not drawn as a flat line at zero.
 */
export function TimelinesSection() {
  const series = useMetricsStore((state) => state.series);
  const latest = useMetricsStore((state) => state.latest);
  const present = TIMELINE_METRICS.filter((id) => series[id].length > 0);
  const missing = TIMELINE_METRICS.filter((id) => series[id].length === 0);

  return (
    <section aria-labelledby="monitor-timelines" className="rounded-lg border border-border p-4">
      <h2 id="monitor-timelines" className="mb-3 text-sm font-medium">
        Usage
      </h2>
      {present.length === 0 ? (
        <p className="text-xs text-muted-foreground">Waiting for the first sample…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {present.map((id) => (
            <div key={id}>
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
                    ...(id === 'cpu' && latest?.cpuInfo ? { detail: cpuDetail(latest.cpuInfo) } : {}),
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}
      {missing.length > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Not readable on this machine: {missing.map((id) => METRIC_LABELS[id]).join(', ')}
        </p>
      ) : null}
    </section>
  );
}
