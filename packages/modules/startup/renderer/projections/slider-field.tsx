import { useEffect, useState } from 'react';

import { FIELD, LABEL } from './styles';

export type SliderFieldProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The text input's display of the value. */
  format: (value: number) => string;
  /** The text input's reading of what was typed; `null` when it is not a number. */
  parse: (text: string) => number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
};

/** Clamps into [min, max] and snaps to the nearest `step` from `min`. */
export function clampSnap(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

/** A range slider paired with a clamped, snapped numeric input; both are labelled by the same text. */
export function SliderField({ id, label, value, min, max, step, format, parse, onChange, disabled = false }: SliderFieldProps) {
  const [text, setText] = useState(() => format(value));
  useEffect(() => setText(format(value)), [value, format]);

  function commit(): void {
    const parsed = parse(text);
    if (parsed === null || !Number.isFinite(parsed)) {
      setText(format(value));
      return;
    }
    const next = clampSnap(parsed, min, max, step);
    setText(format(next));
    if (next !== value) onChange(next);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          className={`${FIELD} w-24 text-right tabular-nums`}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} className="w-full accent-purple-500" onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

/** Reads `12`, `12.5`, `R 3.20`, `+5 %` — the first number in the text. */
export function parseNumber(text: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(text.replace(/[−–]/g, '-').replace(/,/g, ''));
  return m === null ? null : Number(m[0]);
}
