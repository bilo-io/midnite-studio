import { ACCENT_OPTIONS, BACKGROUND_PATTERN_OPTIONS } from '@bilo-io/shell';

import { TreeSection } from '../../components/tree-section';
import {
  useAppearanceStore,
  type AccentId,
  type BgIntensity,
  type Density,
  type Motion,
  type ShimmerDirection,
  type UiFont,
  type VisualEffects,
} from '../../store/appearance-store';
import { GraphThemePicker } from './graph-theme-picker';

/**
 * Settings.
 *
 * Two sections: how the graph is drawn, and the shell's appearance runtime —
 * seven appliers and a 500-line stylesheet that the app has shipped since Phase
 * 0 and never called. Every control here writes a store field; one effect in
 * `useAppearanceSync` pushes the lot at `<html>`.
 */
export function SettingsView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl py-4">
        <h1 className="px-3 pb-3 text-lg font-semibold tracking-tight">Settings</h1>

        <TreeSection title="Graph style" hideWhenEmpty={false}>
          <GraphThemePicker />
        </TreeSection>

        <TreeSection title="Appearance" hideWhenEmpty={false}>
          <AppearanceControls />
        </TreeSection>
      </div>
    </div>
  );
}

function AppearanceControls() {
  const s = useAppearanceStore();

  return (
    <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** A segmented control. Generic so each call site keeps its own union. */
function Choice<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint: string;
  value: T;
  onChange: (next: T) => void;
  options: [T, string][];
}) {
  return (
    <Field label={label} hint={hint}>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {options.map(([option, optionLabel]) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={`h-6 rounded-md border px-2 text-xs transition-colors ${
              value === option
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </Field>
  );
}
