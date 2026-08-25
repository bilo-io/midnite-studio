/**
 * Which files in the all-changes view are expanded.
 *
 * Held as a plain set of paths with a pure reducer beside it so the one rule
 * that needs stating — expand-all is capped — is testable without a DOM.
 */

/**
 * How many files "Expand all" will actually open.
 *
 * Each open file is a `git diff` subprocess and a few hundred DOM rows. On a
 * branch that touched four hundred files, an uncapped expand-all is a
 * multi-second freeze followed by a page nobody can scroll — so the button
 * opens the first N and the view SAYS how many it left closed. A silent
 * truncation would read as "that is all the changes there are".
 */
export const EXPAND_ALL_LIMIT = 40;

export type ExpansionState = ReadonlySet<string>;

export const NOTHING_EXPANDED: ExpansionState = new Set<string>();

export function toggleExpanded(state: ExpansionState, path: string): ExpansionState {
  const next = new Set(state);
  if (!next.delete(path)) next.add(path);
  return next;
}

/** Open the first `EXPAND_ALL_LIMIT` paths, in the order the list shows them. */
export function expandAll(paths: readonly string[]): ExpansionState {
  return new Set(paths.slice(0, EXPAND_ALL_LIMIT));
}

/** How many the cap left closed — 0 when it did not bite. */
export function withheldByCap(paths: readonly string[]): number {
  return Math.max(0, paths.length - EXPAND_ALL_LIMIT);
}
