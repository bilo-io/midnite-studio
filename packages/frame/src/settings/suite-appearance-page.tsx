import { useTheme, type ThemePreference } from '@bilo-io/ui/theme';
import { ACCENT_OPTIONS } from '@bilo-io/shell';

import { useAppearanceStore, type AccentId, type Density, type Motion } from '../prefs/appearance-store';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border/40 py-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-md border px-2.5 py-1 text-xs capitalize ${
            value === option ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * Settings ▸ Appearance for a suite app — theme, accent, motion and density, all persisted in the
 * suite-prefs file, so a change here shows in every open app (Phase 123 Theme H). Studio keeps its own,
 * larger page (palettes, fonts, effects); those need Studio's stores and wait for the page extraction.
 */
export function SuiteAppearancePage() {
  const { preference, setPreference } = useTheme();
  const s = useAppearanceStore();
  return (
    <div className="px-1">
      <Row label="Theme">
        <Choices<ThemePreference> label="Theme" value={preference} options={['system', 'light', 'dark']} onChange={setPreference} />
      </Row>
      <Row label="Accent">
        <div className="flex flex-wrap gap-1.5">
          {ACCENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={s.accent === option.id}
              aria-label={option.label}
              title={option.label}
              onClick={() => s.setAccent(option.id as AccentId)}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${s.accent === option.id ? 'border-foreground' : 'border-transparent'}`}
              style={{ background: option.id === 'default' ? 'hsl(var(--primary))' : `hsl(${option.h} ${option.s}% 55%)` }}
            />
          ))}
        </div>
      </Row>
      <Row label="Motion">
        <Choices<Motion> label="Motion" value={s.motion} options={['system', 'reduced', 'full']} onChange={s.setMotion} />
      </Row>
      <Row label="Density">
        <Choices<Density> label="Density" value={s.density} options={['comfortable', 'compact']} onChange={s.setDensity} />
      </Row>
    </div>
  );
}
