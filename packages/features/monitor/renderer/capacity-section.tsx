import {
  formatUsage,
  GAUGE_GEOMETRY,
  METRIC_LABELS,
  metricColor,
  useMetricsStore,
} from '@midnite/studio-frame';

/** Disk as a gauge (capacity is flat for hours — a chart would imply motion that is not there) and the battery. */
export function CapacitySection() {
  const latest = useMetricsStore((state) => state.latest);
  const battery = latest?.battery;
  const disk = latest?.disk;

  return (
    <section aria-labelledby="monitor-capacity" className="rounded-lg border border-border p-4">
      <h2 id="monitor-capacity" className="mb-3 text-sm font-medium">
        Disk and battery
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          {disk === undefined ? (
            <p className="text-xs text-muted-foreground">Disk capacity is not readable on this machine.</p>
          ) : (
            <>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span style={{ color: metricColor('disk', disk) }}>{METRIC_LABELS.disk}</span>
                <span className="tabular-nums" style={{ color: metricColor('disk', disk) }}>
                  {latest?.diskBytes ? formatUsage(latest.diskBytes.used, latest.diskBytes.total) : `${Math.round(disk)}%`}
                </span>
              </div>
              <div
                role="meter"
                aria-valuenow={Math.round(disk)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Disk capacity used"
                className="w-full overflow-hidden bg-muted"
                style={{ height: GAUGE_GEOMETRY.height, borderRadius: GAUGE_GEOMETRY.radius }}
              >
                <div
                  className="h-full"
                  style={{ width: `${disk}%`, backgroundColor: metricColor('disk', disk), borderRadius: GAUGE_GEOMETRY.radius }}
                />
              </div>
            </>
          )}
        </div>
        <div className="text-xs">
          {!battery?.hasBattery ? (
            <p className="text-muted-foreground">No battery — this machine runs on mains power.</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span>Battery</span>
                <span className="tabular-nums">
                  {battery.percent === undefined ? '—' : `${Math.round(battery.percent)}%`}
                  {battery.isCharging ? ' · charging' : battery.isFullyCharged ? ' · full' : ''}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {battery.devices.map((device) => (
                  <li key={device.id} className="flex justify-between">
                    <span>{device.name}</span>
                    <span className="tabular-nums">{Math.round(device.percent)}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
