import type { Density } from './density';

/**
 * Which of a `StatusToggle`'s three pieces render, given its state.
 *
 * **Two independent axes decide whether text appears in this bar, and only one
 * of them can reach JavaScript.**
 *
 * - *Density* (`full` / `compact` / `collapsed`) is settled in CSS, by the one
 *   `.status-label` / `.status-chord` rule in `styles.css`. It has to be: the
 *   density measurement in [`use-overflow.ts`](./use-overflow.ts) works by
 *   *synchronously* stamping `data-density='full'`, reading `scrollWidth`,
 *   stamping `'compact'`, and reading it again — all inside one
 *   `useLayoutEffect`. A React context carrying density would not have
 *   re-rendered between those two reads, so every measurement would report the
 *   same width and `densityFor` would never see a difference. The gate stays
 *   where it can answer instantly.
 * - *State* (`active` / `hovered`) is settled here, in JS, because it changes
 *   which DOM a toggle emits.
 *
 * So `showsName` below answers the **full-density** question, and CSS supplies
 * the density half on top of it. `showsNameAt` is the complete two-axis truth,
 * exported for tests and for anything that genuinely knows both — it is
 * deliberately *not* what the component calls.
 */
export type ToggleLabelState = {
  /** The surface this toggle controls is open. */
  active: boolean;
  /** Pointer is over the toggle, or it has keyboard focus. */
  hovered: boolean;
};

/**
 * The name renders when the surface is open, or while the toggle is under the
 * pointer or focused — otherwise the chord is what you read, which is the
 * whole point of the rail.
 *
 * Hover is included so the rail is discoverable without toggling panels on:
 * a bare glyph plus `⌘B` tells you the chord but not what it does.
 */
export function showsName({ active, hovered }: ToggleLabelState): boolean {
  return active || hovered;
}

/**
 * The full two-axis answer: state AND density.
 *
 * At `compact`/`collapsed` no toggle shows a name, even an active one. An
 * active label appearing in a narrow window could re-trigger the very overflow
 * that produced the narrow window — and `.status-label` already gives every
 * segment that behaviour for free, so an exception here would be the one
 * carve-out in a rule the whole bar depends on.
 */
export function showsNameAt(state: ToggleLabelState, density: Density): boolean {
  return density === 'full' && showsName(state);
}

/**
 * The chord hint is state-independent: always present at `full`, hidden at
 * `compact`/`collapsed`.
 *
 * Same visibility as the name's density half, expressed separately on purpose.
 * Before this phase the chord *borrowed* `.status-label`, which meant the two
 * could only ever be changed together — and they answer different questions.
 * The chord wears `.status-chord`, a sibling selector in the same CSS rule.
 */
export function showsChordAt(density: Density): boolean {
  return density === 'full';
}
