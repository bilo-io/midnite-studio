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

/** A segmented control. Generic so each call site keeps its own union. */
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
