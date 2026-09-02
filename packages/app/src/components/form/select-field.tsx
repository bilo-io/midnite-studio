/**
 * A small, shared `<select>` (Phase 42 Theme C) — the first entry in
 * `components/form/`, the hoist Phase 41 and Phase 43 both also plan.
 *
 * Scoped deliberately narrow: `council-config-panel.tsx` had the same
 * `<select>` markup and className repeated twice (a member's provider, and
 * the synthesizer's), which is a real, present duplication worth a shared
 * component. `SwitchRow`/`RadioRow` inside `loop-composer.tsx` are a
 * different pair entirely — boolean/choice modifiers, not this — and are
 * left where they are rather than folded in here on spec; a text/textarea
 * field is not hoisted alongside this one for the same reason, since their
 * padding differs enough between call sites that forcing one shape now would
 * be an abstraction with no second real consumer yet.
 */
export function SelectField<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      aria-label={label}
      className={`w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring ${className ?? ''}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
