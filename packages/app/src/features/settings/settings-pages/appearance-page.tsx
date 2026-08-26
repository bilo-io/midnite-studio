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
import { Choice, Field } from './controls';

/**
 * The shell's appearance runtime — seven appliers and a 500-line stylesheet
 * the app shipped since Phase 0. Every control writes a store field; one
 * effect in `useAppearanceSync` pushes the lot at `<html>`. Moved one-to-one
 * from the single-column settings view when Phase 16 split it into pages.
 */
export function AppearancePage() {
  const s = useAppearanceStore();

  return (
    <div className="flex flex-col gap-4">
      <Field label="Accent" hint="Retints primary surfaces, focus rings and the active nav item.">
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
  );
}
