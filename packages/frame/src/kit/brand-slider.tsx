import { forwardRef } from 'react';
import { Slider, type SliderProps } from '@bilo-io/ui';

/**
 * The brand sweep, as CSS variable references so a theme or palette that
 * overrides `--rainbow-*` repaints every slider. The fallbacks mirror
 * `--rainbow-0..5` in `packages/app/src/styles.css` — retune both together.
 */
export const BRAND_SPECTRUM = [
  'var(--rainbow-0, #f43f5e)',
  'var(--rainbow-1, #f59e0b)',
  'var(--rainbow-2, #10b981)',
  'var(--rainbow-3, #2e7cfa)',
  'var(--rainbow-4, #8b5cf6)',
  'var(--rainbow-5, #e740d1)',
] as const;

/** The library gradient `Slider` in the brand sweep; pass `gradient` to override (data-encoding tracks). */
export const BrandSlider = forwardRef<HTMLInputElement, SliderProps>(function BrandSlider(
  { gradient = BRAND_SPECTRUM, ...rest },
  ref,
) {
  return <Slider ref={ref} gradient={gradient} {...rest} />;
});
