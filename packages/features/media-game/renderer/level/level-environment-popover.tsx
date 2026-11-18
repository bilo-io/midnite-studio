import { levelEnvironment, LEVEL_TIME_OF_DAY_MAX, LEVEL_WEATHER_AUTO, type LevelEnvironment } from '@midnite/studio-shared';
import { LuCloudSun } from 'react-icons/lu';

import { Popover } from '../chrome';

const fieldClass = 'h-6 w-24 rounded-md border border-border bg-background px-1 text-[11px] text-foreground disabled:opacity-50';

/** Number input that commits on blur or Enter; empty clears the property. Keyed on the stored value so an undo refreshes it. */
function NumberField({ label, value, placeholder, step, min, max, disabled, onCommit }: { label: string; value: number | null; placeholder: string; step: number; min: number; max?: number; disabled: boolean; onCommit: (raw: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      {label}
      <input
        key={value ?? 'unset'}
        aria-label={label}
        type="number"
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        defaultValue={value === null ? '' : String(value)}
        disabled={disabled}
        className={fieldClass}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          e.stopPropagation();
        }}
      />
    </label>
  );
}

/**
 * The toolbar's Environment menu: the level's weather, the clock when it starts and how fast the game clock runs, saved
 * as `midnite.weather`, `midnite.timeOfDay` and `midnite.timeScale` on the map. The weather list comes from the level's
 * own `midnite.weatherOptions`; with none the field is free text. An empty field removes its property.
 */
export function LevelEnvironmentPopover({
  level,
  readOnly,
  onWeather,
  onTimeOfDay,
  onTimeScale,
}: {
  level: { properties?: ReadonlyArray<{ name: string; value?: unknown }> | undefined };
  readOnly: boolean;
  onWeather: (raw: string) => void;
  onTimeOfDay: (raw: string) => void;
  onTimeScale: (raw: string) => void;
}) {
  const env: LevelEnvironment = levelEnvironment(level);
  const custom = env.weatherOptions.length === 1;
  const options = env.weatherOptions.includes(env.weather) ? env.weatherOptions : [...env.weatherOptions, env.weather];
  const modified = env.weather !== LEVEL_WEATHER_AUTO || env.timeOfDay !== null || env.timeScale !== 1;
  return (
    <Popover label="Environment" title="Environment: weather and time of day" side="bottom" align="start" panelClassName="w-60 space-y-2 p-2" trigger={<LuCloudSun aria-hidden className={`h-3.5 w-3.5 ${modified ? '' : 'opacity-50'}`} />} testId="level-environment-trigger">
      <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        Weather
        {custom ? (
          <input
            key={env.weather}
            aria-label="Weather"
            placeholder={LEVEL_WEATHER_AUTO}
            defaultValue={env.weather === LEVEL_WEATHER_AUTO ? '' : env.weather}
            disabled={readOnly}
            className={fieldClass}
            onBlur={(e) => onWeather(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              e.stopPropagation();
            }}
          />
        ) : (
          <select aria-label="Weather" value={env.weather} disabled={readOnly} onChange={(e) => onWeather(e.target.value)} className={fieldClass}>
            {options.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        )}
      </label>
      <NumberField label="Time of day (h)" value={env.timeOfDay} placeholder="game default" step={0.25} min={0} max={LEVEL_TIME_OF_DAY_MAX} disabled={readOnly} onCommit={onTimeOfDay} />
      <NumberField label="Time scale" value={env.timeScale === 1 ? null : env.timeScale} placeholder="1" step={0.25} min={0} disabled={readOnly} onCommit={onTimeScale} />
      <p className="text-[11px] text-muted-foreground">Time scale 1 is the game&apos;s own speed; 0 freezes the clock.</p>
    </Popover>
  );
}
