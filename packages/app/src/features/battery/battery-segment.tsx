import { useState } from 'react';
import { LuZap } from 'react-icons/lu';
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
export function BatterySegment({ side = 'bottom' }: { side?: 'top' | 'bottom' } = {}) {
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
      side={side}
      align="end"
      label={`Battery ${rounded}%`}
      testId="battery-segment"
      panelClassName="hide-scrollbar w-[320px] max-h-[380px] p-3 overflow-y-auto"
      trigger={
        <span
          className={`relative flex items-center gap-1.5 font-medium transition-colors ${textClass} ${flashClass}`}
          style={glowStyle}
          data-testid="battery-trigger"
          data-tier={tier}
          data-flash-tier={flashTier}
          data-charging={battery?.isCharging ? 'true' : undefined}
        >
          {battery?.isCharging && (
            <LuZap
              className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400"
              aria-hidden="true"
              data-testid="battery-charging-bolt"
            />
          )}
          <BatteryIcon
            percent={rounded}
            isCharging={battery?.isCharging}
            className="h-3.5 w-3.5 shrink-0"
          />
          {/* Not `.status-label`: that class drops text at compact/collapsed
              density, a footer contract this segment left behind when it
              moved into the title bar. The percentage stays put regardless
              of density or hover. */}
          <span className="tabular-nums">{rounded}%</span>
          {battery?.isCharging && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded"
            >
              <span
                data-testid="battery-charging-shimmer"
                className="battery-charging-shimmer absolute inset-0"
              />
            </span>
          )}
        </span>
      }
    >
      <BatteryPanel battery={battery} />
    </Popover>
  );
}
