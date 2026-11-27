import { BrandSlider, Choice, SwitchRow } from '@midnite/studio-frame';
import {
  GAME_LEVEL_PROPS,
  levelEnvironment,
  LEVEL_POST_PRESETS,
  LEVEL_SKY_PRESETS,
  LEVEL_SUN_AZIMUTH_MAX,
  LEVEL_SUN_ELEVATION_MAX,
  LEVEL_SUN_ELEVATION_MIN,
  LEVEL_TIME_OF_DAY_MAX,
  LEVEL_WEATHER_AUTO,
  type LevelEnvironment,
} from '@midnite/studio-shared';
import { useEffect, useRef, type ReactNode } from 'react';
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

/** A patch of map properties: a value sets, `null` removes. */
export type EnvironmentPatch = Record<string, string | number | boolean | null>;

/** Where the sun sits when "From time of day" is switched off, degrees (the kit's own default). */
const DEFAULT_SUN = { azimuth: 52, elevation: 46 };
/** The fog range the kit shows when the level sets none, metres. */
const DEFAULT_FOG = { near: 30, far: 90 };
const GAME_DEFAULT = '';

const hhmm = (h: number) => {
  const m = Math.round(h * 4) * 15;
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * A slider row whose whole drag is one undo step: pressing opens a stroke, releasing anywhere closes it, and every value
 * in between rewrites the same step (`beginStroke` / `endStroke` in the edit model). A key press is its own step.
 */
function SliderRow({ label, readout, min, max, step, value, disabled, onValue, onStroke }: { label: string; readout: string; min: number; max: number; step: number; value: number; disabled: boolean; onValue: (v: number) => void; onStroke: (open: boolean) => void }) {
  const open = useRef(false);
  const close = useRef(() => {});
  close.current = () => {
    if (!open.current) return;
    open.current = false;
    onStroke(false);
  };
  useEffect(() => {
    const up = () => close.current();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      close.current();
    };
  }, []);
  return (
    <div
      className="space-y-0.5"
      onPointerDownCapture={() => {
        if (disabled || open.current) return;
        open.current = true;
        onStroke(true);
      }}
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{readout}</span>
      </div>
      <BrandSlider aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onValueChange={onValue} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 border-t border-border pt-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
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
  onProps,
  onStroke,
  onReset,
}: {
  level: { properties?: ReadonlyArray<{ name: string; value?: unknown }> | undefined };
  readOnly: boolean;
  onWeather: (raw: string) => void;
  onTimeOfDay: (raw: string) => void;
  onTimeScale: (raw: string) => void;
  /** Set (value) or remove (`null`) map properties as one undo step. */
  onProps: (patch: EnvironmentPatch) => void;
  /** A slider drag opens (`true`) and closes (`false`) one undo step. */
  onStroke: (open: boolean) => void;
  /** Remove every environment property in one undo step. */
  onReset: () => void;
}) {
  const env: LevelEnvironment = levelEnvironment(level);
  const custom = env.weatherOptions.length === 1;
  const options = env.weatherOptions.includes(env.weather) ? env.weatherOptions : [...env.weatherOptions, env.weather];
  const modified =
    env.weather !== LEVEL_WEATHER_AUTO || env.timeScale !== 1 || [env.timeOfDay, env.sky, env.sunAzimuth, env.sunElevation, env.fog, env.fogNear, env.fogFar, env.post].some((v) => v !== null);
  const fromTime = env.sunAzimuth === null && env.sunElevation === null;
  const fogOn = env.fog !== false;
  const near = env.fogNear ?? DEFAULT_FOG.near;
  const far = env.fogFar ?? DEFAULT_FOG.far;
  const P = GAME_LEVEL_PROPS;
  return (
    <Popover label="Environment" title="Environment: weather, time, sky, sun, fog and post" side="bottom" align="start" panelClassName="max-h-[70vh] w-64 space-y-2 overflow-y-auto p-2" trigger={<LuCloudSun aria-hidden className={`h-3.5 w-3.5 ${modified ? '' : 'opacity-50'}`} />} testId="level-environment-trigger">
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
      <SliderRow label="Time of day slider" readout={env.timeOfDay === null ? 'game default' : hhmm(env.timeOfDay)} min={0} max={LEVEL_TIME_OF_DAY_MAX} step={0.25} value={env.timeOfDay ?? 12} disabled={readOnly} onValue={(v) => onProps({ [P.timeOfDay]: v })} onStroke={onStroke} />
      <p className="text-[11px] text-muted-foreground">Time scale 1 is the game&apos;s own speed; 0 freezes the clock.</p>
      <Section title="Sky">
        <Choice<string>
          label="Sky"
          hint="Time of day wins when it is set"
          value={env.sky ?? GAME_DEFAULT}
          onChange={(v) => onProps({ [P.sky]: v === GAME_DEFAULT ? null : v })}
          options={[[GAME_DEFAULT, 'Game default'], ...LEVEL_SKY_PRESETS.map((k) => [k, k] as [string, string])]}
        />
      </Section>
      <Section title="Sun">
        <SwitchRow id="sun-from-time" label="From time of day" on={fromTime} onToggle={(_, on) => onProps(on ? { [P.sunAzimuth]: null, [P.sunElevation]: null } : { [P.sunAzimuth]: DEFAULT_SUN.azimuth, [P.sunElevation]: DEFAULT_SUN.elevation })} />
        <SliderRow label="Sun azimuth" readout={`${Math.round(env.sunAzimuth ?? DEFAULT_SUN.azimuth)}°`} min={0} max={LEVEL_SUN_AZIMUTH_MAX} step={1} value={env.sunAzimuth ?? DEFAULT_SUN.azimuth} disabled={readOnly || fromTime} onValue={(v) => onProps({ [P.sunAzimuth]: v })} onStroke={onStroke} />
        <SliderRow label="Sun elevation" readout={`${Math.round(env.sunElevation ?? DEFAULT_SUN.elevation)}°`} min={LEVEL_SUN_ELEVATION_MIN} max={LEVEL_SUN_ELEVATION_MAX} step={1} value={env.sunElevation ?? DEFAULT_SUN.elevation} disabled={readOnly || fromTime} onValue={(v) => onProps({ [P.sunElevation]: v })} onStroke={onStroke} />
      </Section>
      <Section title="Fog">
        <SwitchRow id="fog-on" label="Fog" on={fogOn} onToggle={(_, on) => onProps({ [P.fog]: on })} />
        <SliderRow label="Fog near" readout={`${Math.round(near)} m`} min={0} max={400} step={1} value={near} disabled={readOnly || !fogOn} onValue={(v) => onProps({ [P.fogNear]: Math.min(v, far - 1), ...(env.fogFar === null ? { [P.fogFar]: far } : {}) })} onStroke={onStroke} />
        <SliderRow label="Fog far" readout={`${Math.round(far)} m`} min={10} max={1000} step={5} value={far} disabled={readOnly || !fogOn} onValue={(v) => onProps({ [P.fogFar]: Math.max(v, near + 1), ...(env.fogNear === null ? { [P.fogNear]: near } : {}) })} onStroke={onStroke} />
      </Section>
      <Section title="Post">
        <Choice<string>
          label="Post"
          hint="Post-processing look"
          value={env.post ?? GAME_DEFAULT}
          onChange={(v) => onProps({ [P.post]: v === GAME_DEFAULT ? null : v })}
          options={[[GAME_DEFAULT, 'Game default'], ...LEVEL_POST_PRESETS.map((k) => [k, k] as [string, string])]}
        />
      </Section>
      <button type="button" disabled={readOnly || !modified} onClick={onReset} className="h-6 w-full rounded-md border border-border text-[11px] text-foreground hover:bg-accent disabled:opacity-50">
        Reset to game default
      </button>
    </Popover>
  );
}
