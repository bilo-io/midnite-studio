import type { BatteryReading } from '@midnite/studio-shared';
import { LuBatteryCharging } from 'react-icons/lu';

import { BatteryDeviceIcon } from './battery-device-icon';
import { BatteryIcon } from './battery-icon';
import { getBatteryTier, getBatteryTierClasses } from './battery-style';

export function BatteryPanel({ battery }: { battery: BatteryReading | null | undefined }) {
  const devices = battery?.devices ?? [];

  return (
    <div className="flex flex-col gap-3" data-testid="battery-panel">
      <div className="flex shrink-0 items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <BatteryIcon
            percent={battery?.percent ?? 100}
            isCharging={battery?.isCharging}
            className="h-4 w-4 text-foreground"
          />
          <span>Battery & Connected Devices</span>
        </div>
        {battery?.isCharging && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500">
            <LuBatteryCharging className="h-3.5 w-3.5" />
            <span>Charging</span>
          </span>
        )}
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-muted-foreground">
          <p>No battery devices detected.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {devices.map((device) => {
            const tier = getBatteryTier(device.percent);
            const { textClass, glowStyle } = getBatteryTierClasses(tier);

            return (
              <div
                key={device.id}
                data-testid={`battery-device-${device.id}`}
                className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <BatteryDeviceIcon type={device.type} className="h-4 w-4" />
                  </span>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{device.name}</span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {device.type === 'internal' ? 'Built-in battery' : device.type}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-1.5 font-medium tabular-nums ${textClass}`}
                    style={glowStyle}
                  >
                    <BatteryIcon
                      percent={device.percent}
                      isCharging={device.isCharging}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span>{Math.round(device.percent)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
