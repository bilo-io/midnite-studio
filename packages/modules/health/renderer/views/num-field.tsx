import { useEffect, useId, useState } from 'react';

/**
 * A number input that commits on blur. Empty clears (`onCommit(undefined)`); a value outside `[min, max]`
 * shows its range under the field and is not sent.
 */
export function NumField({
  label,
  value,
  onCommit,
  min,
  max,
  unit,
  integer,
  step,
}: {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  min: number;
  max: number;
  unit?: string;
  integer?: boolean;
  step?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(value === undefined ? '' : String(value));
    setError(null);
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setError(null);
      if (value !== undefined) onCommit(undefined);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < min || n > max || (integer === true && !Number.isInteger(n))) {
      setError(`Between ${min} and ${max}${unit ? ` ${unit}` : ''}`);
      return;
    }
    setError(null);
    if (n !== value) onCommit(n);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
        {unit ? <span className="ml-1 opacity-60">({unit})</span> : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step ?? (integer === true ? '1' : 'any')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        aria-invalid={error !== null}
        className="w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
      {error ? (
        <p className="text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
