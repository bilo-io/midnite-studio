import { useMetricsStore } from '../../store/metrics-store';
import { BatterySegment } from './battery-segment';

/**
 * Battery segment with a trailing hairline separator for the title bar.
 *
 * Renders the battery segment (with side="bottom" so its popover drops down)
 * followed by a hairline separator to the left of ThemeToggle.
 *
 * If the machine has no battery, renders null so no stranded separator is left.
 */
export function TitleBarBattery() {
  const latest = useMetricsStore((state) => state.latest);
  const battery = latest?.battery;
  const percent =
    battery?.percent ??
    (battery?.devices && battery.devices.length > 0 ? battery.devices[0]?.percent : undefined);

  if (percent === undefined || battery?.hasBattery === false) {
    return null;
  }

  return (
    <>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <div className="flex items-center text-xs text-muted-foreground">
        <BatterySegment side="bottom" />
      </div>
    </>
  );
}
