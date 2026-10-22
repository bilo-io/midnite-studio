import { SettingsAccordion, SettingsSwitchRow, bridge } from '@midnite/studio-frame';
import { LuFolderOpen, LuRadar, LuShield, LuTimer } from 'react-icons/lu';

import { useSensors, useVanguardSettings } from './use-vanguard';

/**
 * Settings ▸ Vanguard (Phase 120 Theme B): each sensor on or off, the scan cadence and quarantine
 * retention. Kept in main (`vanguard-store.ts`): sensors start before any window exists. In Studio a sensor
 * does not start until the Vanguard view has been opened once, whatever its switch says.
 */
export function VanguardSettingsPage() {
  const { settings, update } = useVanguardSettings();
  const { sensors } = useSensors();
  return (
    <div className="flex flex-col gap-3">
      <SettingsAccordion title="Sensors" icon={<LuRadar className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-[11px] text-muted-foreground">
            Each sensor watches one thing and writes what it finds to the findings ledger. In Studio none of them
            starts until you have opened the Vanguard view once.
          </p>
          {sensors.sensors.length === 0 ? <p className="text-xs text-muted-foreground">No sensors are installed yet.</p> : null}
          {sensors.sensors.map((sensor) => (
            <SettingsSwitchRow
              key={sensor.id}
              id={`vanguard-sensor-${sensor.id}`}
              label={sensor.label}
              description={sensor.description}
              on={sensor.enabled}
              onToggle={(_id, next) => void update({ sensors: { [sensor.id]: next } })}
            />
          ))}
        </div>
      </SettingsAccordion>
      <SettingsAccordion title="Scanning" icon={<LuTimer className="h-4 w-4" />}>
        <div className="flex flex-col gap-2 p-3">
          <label className="flex items-center justify-between gap-3 text-xs">
            Seconds between sensor runs
            <input
              type="number"
              min={5}
              max={3600}
              aria-label="Seconds between sensor runs"
              value={settings?.cadenceSeconds ?? ''}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 5 && value <= 3600) void update({ cadenceSeconds: value });
              }}
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right"
            />
          </label>
        </div>
      </SettingsAccordion>
      <SettingsAccordion title="Quarantine" icon={<LuShield className="h-4 w-4" />}>
        <div className="flex flex-col gap-2 p-3">
          <label className="flex items-center justify-between gap-3 text-xs">
            Days to keep a quarantined file
            <input
              type="number"
              min={1}
              max={365}
              aria-label="Days to keep a quarantined file"
              value={settings?.quarantineRetentionDays ?? ''}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 365) void update({ quarantineRetentionDays: value });
              }}
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right"
            />
          </label>
          <button
            type="button"
            onClick={() => void bridge()?.vanguard.openQuarantine()}
            className="flex w-fit items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            <LuFolderOpen aria-hidden className="h-3.5 w-3.5" />
            Open quarantine folder
          </button>
        </div>
      </SettingsAccordion>
    </div>
  );
}
