import type { CSSProperties } from 'react';

/**
 * A range input whose filled track and knob wear a gradient. Self-contained on
 * purpose: `@bilo-io/ui` has no Slider yet, and this is the one seam to swap
 * for it later (same value/min/max/step/onChange shape). The styling lives in
 * `.loop-range` (`styles.css`).
 *
 * By default the ramp is the surrounding loop's spectrum (`--fab-spec-1…5`,
 * cascaded from the nearest `[data-fab-tab]`); pass `gradient` (any CSS
 * `<image>`) to override it.
 */
export function GradientSlider({
  id,
  min,
  max,
  step,
  value,
  onValueChange,
  gradient,
  valueText,
  testId,
}: {
  id?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onValueChange: (value: number) => void;
  gradient?: string;
  valueText?: string;
  testId?: string;
}) {
  const style = {
    '--loop-range-pct': `${((value - min) / (max - min)) * 100}%`,
    ...(gradient ? { '--loop-range-ramp': gradient } : {}),
  } as CSSProperties;
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onValueChange(Number(event.target.value))}
      aria-valuetext={valueText}
      className="loop-range h-4 w-full cursor-pointer"
      data-testid={testId}
      style={style}
    />
  );
}
