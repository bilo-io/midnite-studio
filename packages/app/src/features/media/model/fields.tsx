import { useEffect, useRef, useState } from 'react';

import { tidy, type Vec3 } from './editor-state';

/**
 * The editor's small form controls — plain DOM, the app's own look. Numbers and text are drafted
 * while typing and committed on Enter or blur, so one edit is one undo step.
 */
export const FIELD = 'h-6 min-w-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      <input
        aria-label={label}
        value={draft}
        maxLength={60}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        className={`${FIELD} min-w-0 flex-1`}
      />
    </label>
  );
}

export const toHex6 = (value: string): string => (value.length === 4 ? `#${[...value.slice(1)].map((c) => c + c).join('')}` : value);

/** A native colour input; the native `change` event (picker closed) is the one commit. */
export function ColorField({ value, onCommit, label = 'Colour' }: { value: string; onCommit: (value: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const hex = toHex6(value);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const onChange = () => onCommit(input.value);
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, [onCommit]);
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      <input ref={ref} aria-label={label} type="color" defaultValue={hex} key={hex} className="h-6 w-8 cursor-pointer rounded border border-border bg-background p-0.5" />
    </label>
  );
}

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

export function VecRow({
  label,
  value,
  step,
  min,
  nonZero,
  onCommit,
}: {
  label: string;
  value: readonly number[];
  step: number;
  min?: number;
  nonZero?: boolean;
  onCommit: (value: Vec3) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <NumberField
          key={axis}
          label={`${label} ${axis}`}
          value={value[i]!}
          step={step}
          {...(min !== undefined ? { min } : {})}
          {...(nonZero ? { nonZero } : {})}
          onCommit={(next) => {
            if (next === undefined) return;
            const out = [...value] as Vec3;
            out[i] = next;
            onCommit(out);
          }}
        />
      ))}
    </div>
  );
}

/** A slider paired with a number box; commits when the drag ends (one undo step), not on every tick. */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (next: number) => {
    if (next !== value) onCommit(tidy(next));
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        onBlur={() => commit(draft)}
        className="h-1 min-w-0 flex-1 accent-primary"
      />
      <NumberField label={label} value={value} step={step} min={min} max={max} onCommit={(next) => next !== undefined && commit(next)} />
    </div>
  );
}

export const SECTION = 'text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80';

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)} className={`${FIELD} min-w-0 flex-1`}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
