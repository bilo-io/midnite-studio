import { useState, type ComponentType } from 'react';

import { METRIC_IDS, type MetricId } from '@midnite/studio-shared';

import { MetricDonut } from '../../../metrics/metric-donut';
import { isLevelMetric } from '../../../metrics/metric-geometry';
import { METRIC_ICONS } from '../../../metrics/metric-icons';
import { METRIC_LABELS, metricColor } from '../../../metrics/metric-palette';
import { useMetricsStore, type MetricPoint } from '../../../metrics/metrics-store';
import { Sparkline } from '../../../metrics/sparkline';
import { useMetricsStream } from '../../../metrics/use-metrics-stream';
import { useMonitorPrefsStore } from '../../../prefs/monitor-prefs-store';
import { useStatusBarChrome } from '../status-bar-chrome';

/**
 * The status bar's monitor segment (Phase 123 Theme K) — the same cluster in every suite app.
 *
 * It moved here from `packages/app`, which is why the two things it cannot own are handed in:
 * the flyout belongs to the monitor *feature* (the frame never imports one) and "Open Monitor"
 * is each app's own hand-off (Studio navigates in process, a standalone app asks the launcher,
 * the Monitor app navigates in place).
 */
export type MonitorFlyoutProps = { onOpenMonitor: () => void };

export type MonitorSegmentOptions = {
  /** The monitor feature's `MonitorFlyout`: CPU/RAM/GPU timelines and the capacity gauge. */
  Flyout: ComponentType<MonitorFlyoutProps>;
  /** The "Open Monitor" button — in practice `requestHandoff({ app: 'monitor', view: 'monitor' })`. */
  openMonitor: () => void;
};

/**
 * Dot, percentage and sparkline per metric, opening into the timeline flyout.
 *
 * **A metric that is `null` renders no readout at all** — no dot, no dash, no zero. A machine
 * that cannot read its GPU shows three readouts, and that is the honest picture; a greyed-out
 * "GPU —" would imply something is temporarily wrong, and "GPU 0%" would be a plain lie. Before
 * the first sample the whole segment renders nothing.
 */
export function createMonitorSegment({ Flyout, openMonitor }: MonitorSegmentOptions): ComponentType {
  function MonitorCluster() {
    const [open, setOpen] = useState(false);
    const { Popover } = useStatusBarChrome();
    const latest = useMetricsStore((state) => state.latest);
    const series = useMetricsStore((state) => state.series);
    const hidden = useMonitorPrefsStore((state) => state.hiddenMetrics);
    const idleIntervalMs = useMonitorPrefsStore((state) => state.metricsIdleIntervalMs);

    // Cadence is a consequence of what is on screen — the flyout escalates to 2s — with the
    // closed-flyout figure taken from preferences.
    useMetricsStream({ detailed: open, idleIntervalMs });

    // Two independent reasons a readout is absent: the machine cannot report it, or the user
    // turned it off. Sampling is NOT narrowed to the visible set — the flyout still charts a
    // hidden metric, and un-hiding one should show history rather than start from nothing.
    const present = METRIC_IDS.filter((id) => typeof latest?.[id] === 'number' && !hidden.includes(id));
    if (present.length === 0) return null;

    return (
      <Popover
        open={open}
        onOpenChange={setOpen}
        side="top"
        align="end"
        label="System monitor"
        testId="monitor-cluster"
        panelClassName="max-w-[calc(100vw-1rem)]"
        triggerClassName="status-graphs-on-hover flex items-center gap-3 rounded px-1 transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent"
        trigger={present.map((id) => (
          <MetricReadout key={id} id={id} value={latest![id]!} points={series[id]} />
        ))}
      >
        <Flyout
          onOpenMonitor={() => {
            setOpen(false);
            openMonitor();
          }}
        />
      </Popover>
    );
  }
  return MonitorCluster;
}

/**
 * One metric's readout, in whichever of the two forms it earns: a **rate** (CPU, RAM, GPU) is an
 * icon, a percentage and a sparkline; a **level** (disk) is an icon, a percentage and a ring.
 */
function MetricReadout({ id, value, points }: { id: MetricId; value: number; points: readonly MetricPoint[] }) {
  const { Tooltip } = useStatusBarChrome();
  const rounded = Math.round(value);
  const level = isLevelMetric(id);
  const Icon = METRIC_ICONS[id];
  const label = METRIC_LABELS[id];

  return (
    <Tooltip label={label} side="top">
      <span
        className="flex items-center gap-1"
        data-testid={`metric-${id}`}
        // The readout is one fact; without this a screen reader announces the label, the number
        // and the unit as three fragments with an unlabelled graphic between them.
        aria-label={`${label} ${rounded} percent`}
      >
        <Icon
          aria-hidden
          data-testid={`metric-icon-${id}`}
          className="h-3 w-3 shrink-0"
          style={{ color: metricColor(id, value) }}
        />
        <span aria-hidden className="w-8 text-right tabular-nums" style={{ color: metricColor(id, value) }}>
          {rounded}%
        </span>
        <span className="status-bar-graph" data-status-bar-graph>
          {level ? <MetricDonut id={id} percent={value} /> : <Sparkline id={id} points={points} />}
        </span>
      </span>
    </Tooltip>
  );
}
