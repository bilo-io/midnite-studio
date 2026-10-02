/** The least the form may shrink to: enough for the agent/model row. */
export const LOOP_FORM_MIN = 96;
/** The least the run terminal keeps, so it never collapses to nothing. */
export const LOOP_TERMINAL_MIN = 140;
/** The splitter's own height, which the two panes share the rest around. */
export const LOOP_HANDLE_HEIGHT = 5;

export type LoopFormRange = { min: number; max: number };

/** Range the form height may take in a pane `container` px tall. */
export function loopFormRange(container: number): LoopFormRange {
  const max = Math.max(LOOP_FORM_MIN, container - LOOP_TERMINAL_MIN - LOOP_HANDLE_HEIGHT);
  return { min: LOOP_FORM_MIN, max };
}

/**
 * The height to draw the form at.
 *
 * `stored` of 0 (or less) is "never dragged": the form takes its `natural`
 * content height, so nothing scrolls unless the window is too short. Either
 * way the result is clamped into the pane, which is also what keeps a height
 * persisted from a taller window from overflowing a shorter one.
 */
export function resolveLoopFormHeight(stored: number, natural: number, container: number): number {
  const { min, max } = loopFormRange(container);
  const wanted = stored > 0 ? stored : natural;
  return Math.min(Math.max(wanted, min), max);
}
