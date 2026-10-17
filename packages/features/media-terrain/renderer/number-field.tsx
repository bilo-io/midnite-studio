import { useEffect, useState } from 'react';

const FIELD = 'h-6 min-w-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';
const tidy = (value: number): number => Math.round(value * 10000) / 10000;

/**
 * A number box drafted while typing and committed on Enter or blur, so one edit is one undo step.
 * A copy of the Model editor's `NumberField` (`features/media/model/fields.tsx`): this package may not
 * reach into an app, and the control is small enough that a copy is cheaper than a port.
 */
export function NumberField({
  label,
  value,
  step,
  min,
  max,
  nonZero,
  integer,
  placeholder,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  step: number;
  min?: number;
  max?: number;
  /** Negative values are fine but 0 is not (a scale). */
  nonZero?: boolean;
  integer?: boolean;
  placeholder?: string;
  onCommit: (value: number | undefined) => void;
}) {
  const show = (v: number | undefined): string => (v === undefined ? '' : String(tidy(v)));
  const [draft, setDraft] = useState(show(value));
  useEffect(() => setDraft(show(value)), [value]);
  const commit = () => {
    if (draft.trim() === '' && placeholder !== undefined) {
      if (value !== undefined) onCommit(undefined);
      return;
    }
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) return setDraft(show(value));
    let next = integer ? Math.round(parsed) : parsed;
    if (min !== undefined) next = Math.max(next, min);
    if (max !== undefined) next = Math.min(next, max);
    if (nonZero && next === 0) next = value && value < 0 ? -0.01 : 0.01;
    if (next !== value) onCommit(tidy(next));
    else setDraft(show(value));
  };
  return (
    <input
      aria-label={label}
      type="number"
      step={step}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      className={`${FIELD} w-0 flex-1 tabular-nums`}
    />
  );
}
