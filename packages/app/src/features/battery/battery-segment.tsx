import { useState } from 'react';
import { Popover } from '../../components/popover';
import { useMetricsStore } from '../../store/metrics-store';
import { useMetricsStream } from '../monitor/use-metrics-stream';
import { useUiStore } from '../../store/ui-store';
import { BatteryIcon } from './battery-icon';
import { BatteryPanel } from './battery-panel';
import {
  getBatteryFlashClass,
  getBatteryFlashTier,
  getBatteryTier,
  getBatteryTierClasses,
} from './battery-style';

/**
 * Battery segment for the status bar:
 * - Dynamic battery icon filled to match capacity percentage
 * - Percentage label
 * - Color-coded: >70% Green, 30-69% Orange, <30% Red
 * - Subtle box-shadow/glow effect when in red (<30%)
 * - Click popover panel listing all connected battery devices with appropriate icons
 */
export function BatterySegment() {
  const [open, setOpen] = useState(false);
  const latest = useMetricsStore((state) => state.latest);
  const idleIntervalMs = useUiStore((state) => state.metricsIdleIntervalMs);

  useMetricsStream({ detailed: open, idleIntervalMs });

  const battery = latest?.battery;
  const percent = battery?.percent ?? (battery?.devices && battery.devices.length > 0 ? battery.devices[0]?.percent : undefined);

  // If no battery is reported on this machine / setup, render nothing
  if (percent === undefined || battery?.hasBattery === false) {
    return null;
  }

  const rounded = Math.round(percent);
  const tier = getBatteryTier(rounded);
  const { textClass, glowStyle } = getBatteryTierClasses(tier);
  const flashTier = getBatteryFlashTier(rounded);
  const flashClass = getBatteryFlashClass(flashTier);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      label={`Battery ${rounded}%`}
      testId="battery-segment"
      panelClassName="w-[320px] max-h-[380px] p-3 overflow-y-auto"
      trigger={
        <span
          className={`flex items-center gap-1.5 font-medium transition-colors ${textClass} ${flashClass}`}
          style={glowStyle}
          data-testid="battery-trigger"
          data-tier={tier}
          data-flash-tier={flashTier}
        >
          <BatteryIcon
            percent={rounded}
            isCharging={battery?.isCharging}
            className="h-3.5 w-3.5 shrink-0"
          />
          <span className="status-label tabular-nums">{rounded}%</span>
        </span>
      }
    >
      <BatteryPanel battery={battery} />
    </Popover>
  );
}
