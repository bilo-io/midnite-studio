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

/**
 * `TextArea`'s `gradient` variant — the `.gradient-border`/`.gradient-border--glow`
 * halo (`styles.css`) instead of the plain `focus:ring-1 focus:ring-ring`
 * above, matching `notes-modal.tsx`'s composer. `border-0`/`outline-none`
 * replace `TEXT_INPUT_CLASSNAME`'s `border border-input` and focus ring: the
 * wrapper draws the border on `:focus-within`, so the control must not draw
 * its own or the two would double up. `block` is load-bearing the same way it
 * is there — a `<textarea>` is inline-block by default, so without it the
 * wrapper sizes to the line box and leaves a descender gap under the control.
 */
const GRADIENT_TEXT_AREA_CLASSNAME =
  'block w-full rounded-md border-0 bg-background px-1.5 py-1 text-xs outline-none disabled:opacity-50';

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
  /**
   * Opt-in gradient-border-on-focus halo (Ad Hoc: Settings ▸ Companion ▸
   * Personality's two free-text fields), matching every other "this is where
   * your keystrokes are going" control in the app. Off by default, so every
   * existing `TextArea` consumer — `controls.tsx`'s settings pages, the
   * workflow node inspector's `node-forms.tsx` — keeps its plain focus ring
   * unchanged.
   */
  gradient?: boolean;
}) {
  const textarea = (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className={`resize-none ${gradient ? GRADIENT_TEXT_AREA_CLASSNAME : TEXT_INPUT_CLASSNAME} ${className ?? ''}`}
    />
  );

  if (!gradient) return textarea;

  // `.gradient-border--glow`'s box-shadow halo fires on `:focus-within`, so
  // wrapping is the whole mechanism — no state, no extra props on the
  // textarea itself.
  return <div className="gradient-border gradient-border--glow rounded-md">{textarea}</div>;
}
