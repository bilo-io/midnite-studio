/**
 * The setup overlay's page state machine (Phase 98 Theme A):
 * `intro → page[0] … page[n-1] → finale → closed`.
 *
 * Pure and index-based, so it is testable without React and knows nothing
 * about what a page renders. `pageCount` is passed rather than read from
 * `SETUP_PAGES` so a test can drive any length, including zero.
 */
export type SetupStep =
  | { kind: 'intro' }
  | { kind: 'page'; index: number }
  | { kind: 'finale' }
  | { kind: 'closed' };

export const INTRO: SetupStep = { kind: 'intro' };
export const FINALE: SetupStep = { kind: 'finale' };
export const CLOSED: SetupStep = { kind: 'closed' };

/** Next: forward one step. The finale's Next is Get started, which closes. */
export function nextStep(step: SetupStep, pageCount: number): SetupStep {
  switch (step.kind) {
    case 'intro':
      return pageCount > 0 ? { kind: 'page', index: 0 } : FINALE;
    case 'page':
      return step.index + 1 < pageCount ? { kind: 'page', index: step.index + 1 } : FINALE;
    case 'finale':
    case 'closed':
      return CLOSED;
  }
}

/** Back: one step back, stopping at the intro. Closed stays closed. */
export function prevStep(step: SetupStep, pageCount: number): SetupStep {
  switch (step.kind) {
    case 'intro':
      return INTRO;
    case 'page':
      return step.index > 0 ? { kind: 'page', index: step.index - 1 } : INTRO;
    case 'finale':
      return pageCount > 0 ? { kind: 'page', index: pageCount - 1 } : INTRO;
    case 'closed':
      return CLOSED;
  }
}

/**
 * Where an open starts: the named page when it exists, the intro otherwise.
 * An unknown id — a page removed since it was recorded — falls back to the
 * intro rather than to a guess.
 */
export function initialStep(startPageId: string | null, pageIds: readonly string[]): SetupStep {
  if (startPageId === null) return INTRO;
  const index = pageIds.indexOf(startPageId);
  return index === -1 ? INTRO : { kind: 'page', index };
}

/** How a pagination dot renders against the step showing. */
export type DotState = 'active' | 'done' | 'skipped' | 'upcoming';

/**
 * One dot per page. Before the current page: done, or skipped when the user
 * left that page through Skip on an earlier visit. At the finale every page
 * is behind, so every dot is done or skipped; at the intro every dot is ahead.
 */
export function dotStates(
  step: SetupStep,
  pageIds: readonly string[],
  skippedPageIds: readonly string[],
): DotState[] {
  const current =
    step.kind === 'page' ? step.index : step.kind === 'intro' ? -1 : pageIds.length;
  return pageIds.map((id, index) => {
    if (index === current) return 'active';
    if (index > current) return 'upcoming';
    return skippedPageIds.includes(id) ? 'skipped' : 'done';
  });
}

/**
 * Where the FAB's **Resume setup** (Phase 98 Theme C) reopens: the first page
 * that is neither complete nor skipped.
 *
 * Completion is not recorded per page — setup is linear, so every page before
 * the one the user left from counts as passed. The scan therefore starts at
 * `lastPageId` (the first page when there is none, or it is gone) and takes
 * the first page from there that is not in `skippedPageIds`: X on a page
 * resumes that page, Skip on it resumes the one after. When everything from
 * there on was skipped, it goes back to the page left from rather than
 * guessing further. `null` only when there are no pages at all.
 */
export function resumePageId(
  pageIds: readonly string[],
  state: { lastPageId: string | null; skippedPageIds: readonly string[] },
): string | null {
  if (pageIds.length === 0) return null;
  const last = state.lastPageId === null ? -1 : pageIds.indexOf(state.lastPageId);
  const from = Math.max(last, 0);
  for (let index = from; index < pageIds.length; index += 1) {
    const id = pageIds[index]!;
    if (!state.skippedPageIds.includes(id)) return id;
  }
  return pageIds[from] ?? null;
}
