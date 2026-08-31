import { Accordion } from '@bilo-io/ui';
import { LuCalendar, LuClock, LuImage, LuPalette, LuSparkles } from 'react-icons/lu';

import { ACCENT_OPTIONS, BACKGROUND_PATTERN_OPTIONS } from '@bilo-io/shell';

import {
  useAppearanceStore,
  type AccentId,
  type BgIntensity,
  type Density,
  type Motion,
  type ShimmerDirection,
  type UiFont,
  type VisualEffects,
} from '../../../store/appearance-store';
import { useTitlebarStatusStore } from '../../titlebar-status/titlebar-status-store';
import { Choice, Field } from './controls';

/**
 * The shell's appearance runtime — seven appliers and a 500-line stylesheet
 * the app shipped since Phase 0. Every control writes a store field; one
 * effect in `useAppearanceSync` pushes the lot at `<html>`. Moved one-to-one
 * from the single-column settings view when Phase 16 split it into pages,
 * then regrouped into accordions so eight independent controls read as three
 * topics instead of one undifferentiated column.
 */
export function AppearancePage() {
  const s = useAppearanceStore();

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Theme" icon={<LuPalette className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Accent"
            hint="Retints primary surfaces, focus rings and the active nav item."
          >
            <div className="flex flex-wrap gap-1.5">
              {ACCENT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => s.setAccent(option.id as AccentId)}
                  aria-pressed={s.accent === option.id}
                  aria-label={option.label}
                  title={option.label}
                  className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                    s.accent === option.id ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{
                    // `default` has no hue of its own — show the current primary
                    // rather than a black hole in the middle of the swatch row.
                    background:
                      option.id === 'default'
                        ? 'hsl(var(--primary))'
                        : `hsl(${option.h} ${option.s}% 55%)`,
                  }}
                />
              ))}
            </div>
          </Field>

          <Choice<Motion>
            label="Motion"
            hint="Reduced disables every animation. System follows your OS setting."
            value={s.motion}
            onChange={s.setMotion}
            options={[
              ['system', 'System'],
              ['full', 'Full'],
              ['reduced', 'Reduced'],
            ]}
          />

          <Choice<Density>
            label="Density"
            hint="Compact drops the root font size, tightening every row in the app."
            value={s.density}
            onChange={s.setDensity}
            options={[
              ['comfortable', 'Comfortable'],
              ['compact', 'Compact'],
            ]}
          />

          <Choice<UiFont>
            label="Interface font"
            hint="System fonts only, so switching is instant with no download."
            value={s.uiFont}
            onChange={s.setUiFont}
            options={[
              ['system', 'System'],
              ['grotesk', 'Grotesk'],
              ['humanist', 'Humanist'],
              ['serif', 'Serif'],
              ['mono', 'Mono'],
            ]}
          />
        </div>
      </Accordion>

      <Accordion title="Background" icon={<LuImage className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field label="Backdrop" hint="The pattern behind the app's content.">
            <select
              value={s.background}
              onChange={(event) => s.setBackground(event.target.value)}
              className="h-7 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-primary"
            >
              {BACKGROUND_PATTERN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Choice<BgIntensity>
            label="Backdrop intensity"
            hint="How far forward the animated gradient comes."
            value={s.bgIntensity}
            onChange={s.setBgIntensity}
            options={[
              ['subtle', 'Subtle'],
              ['balanced', 'Balanced'],
              ['bold', 'Bold'],
            ]}
          />
        </div>
      </Accordion>

      <Accordion title="Effects" icon={<LuSparkles className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field label="Visual effects" hint="Each is independent of the motion setting.">
            <div className="flex flex-col gap-1.5">
              {(
                [
                  ['pageReveal', 'Page reveal'],
                  ['typewriter', 'Typewriter'],
                  ['glass', 'Frosted glass'],
                ] as [keyof VisualEffects, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={s.effects[key]}
                    onChange={(event) => s.setEffect(key, event.target.checked)}
                    className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          <Choice<ShimmerDirection>
            label="Shimmer direction"
            hint="Which end of a status row the shimmer leads from."
            value={s.shimmer}
            onChange={s.setShimmer}
            options={[
              ['ltr', 'Left to right'],
              ['rtl', 'Right to left'],
            ]}
          />
        </div>
      </Accordion>

      <TitlebarTimeSettingsAccordion />
      <TitlebarDateSettingsAccordion />
    </div>
  );
}

function TitlebarTimeSettingsAccordion() {
  const showTime = useTitlebarStatusStore((s) => s.showTime);
  const setShowTime = useTitlebarStatusStore((s) => s.setShowTime);
  const clockMode = useTitlebarStatusStore((s) => s.clockMode);
  const setClockMode = useTitlebarStatusStore((s) => s.setClockMode);
  const showSeconds = useTitlebarStatusStore((s) => s.showSeconds);
  const setShowSeconds = useTitlebarStatusStore((s) => s.setShowSeconds);
  const worldClocksMode = useTitlebarStatusStore((s) => s.worldClocksMode);
  const setWorldClocksMode = useTitlebarStatusStore((s) => s.setWorldClocksMode);

  return (
    <Accordion title="Titlebar Time" icon={<LuClock className="h-4 w-4" />} defaultOpen>
      <div className="flex flex-col gap-4 p-3">
        <Field
          label="Titlebar Center Pill Items"
          hint="Choose whether the time appears in the top center status bar."
        >
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showTime}
              onChange={(e) => setShowTime(e.target.checked)}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            />
            Time
          </label>
        </Field>

        <Choice<string>
          label="Clock display mode"
          hint="Digital clock face or analogue clock in popup."
          value={clockMode}
          onChange={(v) => setClockMode(v as 'digital' | 'analogue')}
          options={[
            ['digital', 'Digital'],
            ['analogue', 'Analogue'],
          ]}
        />

        <Choice<string>
          label="World clocks style"
          hint="Clock style used for world timezone cards."
          value={worldClocksMode}
          onChange={(v) => setWorldClocksMode(v as 'digital' | 'analogue')}
          options={[
            ['digital', 'Digital'],
            ['analogue', 'Analogue'],
          ]}
        />

        <Field label="Seconds display" hint="Show live seconds in digital clock.">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showSeconds}
              onChange={(e) => setShowSeconds(e.target.checked)}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            />
            Show seconds (:ss)
          </label>
        </Field>
      </div>
    </Accordion>
  );
}

function TitlebarDateSettingsAccordion() {
  const showDate = useTitlebarStatusStore((s) => s.showDate);
  const showWeather = useTitlebarStatusStore((s) => s.showWeather);
  const setShowDate = useTitlebarStatusStore((s) => s.setShowDate);
  const setShowWeather = useTitlebarStatusStore((s) => s.setShowWeather);

  const weatherUnits = useTitlebarStatusStore((s) => s.weatherUnits);
  const setWeatherUnits = useTitlebarStatusStore((s) => s.setWeatherUnits);

  return (
    <Accordion title="Titlebar Date" icon={<LuCalendar className="h-4 w-4" />} defaultOpen>
      <div className="flex flex-col gap-4 p-3">
        <Field
          label="Titlebar Center Pill Items"
          hint="Choose which date/weather elements appear in the top center status bar."
        >
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showDate}
                onChange={(e) => setShowDate(e.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Date
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showWeather}
                onChange={(e) => setShowWeather(e.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Weather & temperature
            </label>
          </div>
        </Field>

        <Choice<string>
          label="Temperature units"
          hint="Display temperature in Celsius or Fahrenheit."
          value={weatherUnits}
          onChange={(v) => setWeatherUnits(v as 'c' | 'f')}
          options={[
            ['c', 'Celsius (°C)'],
            ['f', 'Fahrenheit (°F)'],
          ]}
        />
      </div>
    </Accordion>
  );
}
