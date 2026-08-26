/**
 * The settings form primitives, shared by every page. Extracted verbatim from
 * the pre-Phase-16 single-column settings view.
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
