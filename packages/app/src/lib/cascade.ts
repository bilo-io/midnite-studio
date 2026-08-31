import type { CSSProperties } from 'react';

/**
 * How many items still get a distinct delay before the stagger flattens.
 *
 * The cap is the whole point. A stagger is a reading aid — it says "these
 * arrived together, in this order" — and it only reads as one at small counts.
 * Uncapped, a 500-branch repo would fan its sidebar in over nine seconds, and
 * the last item would arrive long after the user had started clicking. Past
 * this index every remaining item shares the final delay and they land as one
 * group, which is what a long list should look like anyway.
 */
export const CASCADE_MAX_STEPS = 12;

/** Per-item delay. 12 steps x 18ms puts the last distinct item at ~216ms. */
export const CASCADE_STEP_MS = 18;

/**
 * Inline style for one item in a cascading list.
 *
 * Pair with `animate-fade-in-up` and the `cascade-delay` class:
 *
 * ```tsx
 * <li style={cascadeStyle(i)} className="animate-fade-in-up cascade-delay">
 * ```
 *
 * The index travels as a CSS custom property rather than a computed
 * `animationDelay` string so the delay arithmetic lives in one place (the
 * `cascade-delay` rule in styles.css) instead of being re-derived at every call
 * site — and so reduced motion can neutralise it in CSS alone.
 */
export function cascadeStyle(index: number, maxSteps = CASCADE_MAX_STEPS): CSSProperties {
  return { '--i': Math.min(index, maxSteps) } as CSSProperties;
}
