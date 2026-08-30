import { METRIC_IDS, type MetricId } from '@midnite/studio-shared';
import { useState } from 'react';

import { Popover } from '../../components/popover';
import { useMetricsStore, type MetricPoint } from '../../store/metrics-store';
import { useUiStore } from '../../store/ui-store';
import { MetricDonut } from './metric-donut';
import { isLevelMetric } from './metric-geometry';
import { METRIC_LABELS, metricColor, metricGlow } from './metric-palette';
import { MonitorFlyout } from './monitor-flyout';
import { Sparkline } from './sparkline';
import { useMetricsStream } from './use-metrics-stream';

/**
 * Dot, percentage and sparkline per metric, opening into the timeline flyout.
 *
 * **A metric that is `null` renders no readout at all** — no dot, no dash, no
 * zero. A machine that cannot read its GPU shows three readouts, and that is
 * the honest picture; a greyed-out "GPU —" would be a control implying
 * something is temporarily wrong, and a "GPU 0%" would be a plain lie.
 */
export function MonitorCluster() {
  const [open, setOpen] = useState(false);
  const latest = useMetricsStore((state) => state.latest);
  const series = useMetricsStore((state) => state.series);
  const hidden = useUiStore((state) => state.hiddenMetrics);
  const idleIntervalMs = useUiStore((state) => state.metricsIdleIntervalMs);

  // Cadence is a consequence of what is on screen — the flyout escalates to 2s
  // — with the closed-flyout figure taken from settings.
  useMetricsStream({ detailed: open, idleIntervalMs });

  /*
    Two independent reasons a readout is absent, and they compose in one
    direction only: the machine cannot report it, or the user turned it off.
    Sampling is NOT narrowed to the visible set — the flyout still charts a
    metric you have hidden from the strip, and un-hiding one should show
    history rather than start from nothing.
  */
  const present = METRIC_IDS.filter(
    (id) => typeof latest?.[id] === 'number' && !hidden.includes(id),
  );
  // Before the first sample there is nothing truthful to draw. An empty
  // cluster for a second or two beats four zeroes that then jump.
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
      trigger={present.map((id) => (
        <MetricReadout key={id} id={id} value={latest![id]!} points={series[id]} />
      ))}
    >
      <MonitorFlyout />
    </Popover>
  );
}

/**
 * One metric's readout, in whichever of the two forms it earns.
 *
 * A **rate** — CPU, RAM, GPU — is a dot, a percentage and a sparkline: the
 * number is now, the line is the last few minutes, and the dot is what makes
 * the pair findable at a glance in a 24px strip.
 *
 * A **level** — disk capacity — is a ring and a percentage, and no dot. Two
 * changes, one reason: a sparkline of capacity is a flat line implying a trend
 * that is not there (`isLevelMetric`, and the flyout's bar, make the same
 * argument), and the ring is already a coloured mark in the metric's own hue,
 * so a dot beside it would be the same identification twice. The ring takes
 * the dot's place at the head of the readout rather than the sparkline's, so
 * the column of percentages down the strip stays aligned.
 */
function MetricReadout({
  id,
  value,
  points,
}: {
  id: MetricId;
  value: number;
  points: readonly MetricPoint[];
}) {
  const rounded = Math.round(value);
  const level = isLevelMetric(id);
  return (
    <span
      className="flex items-center gap-1"
      data-testid={`metric-${id}`}
      // The readout as a whole is one fact; without this a screen reader
      // announces the label, the number and the unit as three fragments with
      // an unlabelled graphic between them.
      aria-label={`${METRIC_LABELS[id]} ${rounded} percent`}
    >
      {level ? (
        <MetricDonut id={id} percent={value} />
      ) : (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          // Data colours, so inline rather than a token class — see
          // metric-palette.ts. The glow is what makes a 2px dot read as lit
          // rather than as a speck of dust on the screen.
          style={{ backgroundColor: metricColor(id), boxShadow: metricGlow(id) }}
        />
      )}
      <span aria-hidden className="w-8 text-right tabular-nums">
        {rounded}%
      </span>
      {level ? null : <Sparkline id={id} points={points} />}
    </span>
  );
}
