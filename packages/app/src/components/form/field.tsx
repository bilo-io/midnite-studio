/**
 * The settings form primitives, hoisted out of
 * `features/settings/settings-pages/controls.tsx` (Phase 43 Theme F) so a
 * second form — the workflow node inspector — can draw the same label/hint
 * layout and segmented control without a second copy. `controls.tsx`
 * re-exports `Field`/`Choice` from here rather than defining them, so its
 * existing dozen call sites need no change.
 *
 * `TextField`/`TextArea` are new here, not moved: nothing bare-element styled
 * this way had a second consumer before the inspector, which is why
 * `council-config-panel.tsx`'s own input/textarea stayed unhoisted through
 * Phase 42.
 */
export function Field({
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

/**
 * A segmented control. Generic so each call site keeps its own union.
 *
 * An option may carry a third element — a one-line hint for what picking it
 * does. It becomes the button's `title` and, for the selected option, a line of
 * muted text under the row: midnite's own side-navigation control does exactly
 * this, because three terse labels ("Auto", "Locked open", "Locked closed")
 * cannot say what they mean and a single field hint cannot say it three ways.
 * Omit the element and the control renders exactly as it always has.
 */
export function Choice<T extends string>({
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
  options: ([T, string] | [T, string, string])[];
}) {
  const selectedHint = options.find(([option]) => option === value)?.[2];
  return (
    <Field label={label} hint={hint}>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {options.map(([option, optionLabel, optionHint]) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            title={optionHint}
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
      {selectedHint ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{selectedHint}.</p>
      ) : null}
    </Field>
  );
}

/** Shared className for a single-line/multi-line text field, matching `SelectField`'s own. */
const TEXT_INPUT_CLASSNAME =
  'w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-50';

export function TextField({
  value,
  onChange,
  label,
  placeholder,
  disabled,
  className,
  onFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      className={`${TEXT_INPUT_CLASSNAME} ${className ?? ''}`}
    />
  );
}

export function TextArea({
  value,
  onChange,
  label,
  placeholder,
  disabled,
  rows = 3,
  className,
  onFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  onFocus?: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className={`resize-none ${TEXT_INPUT_CLASSNAME} ${className ?? ''}`}
    />
  );
}
