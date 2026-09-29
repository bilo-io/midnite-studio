import type { ComponentType } from 'react';

/**
 * One page of the setup overlay (Phase 98 Theme A), grown out of the old
 * wizard's `WizardStep` (Phase 90 Theme I).
 *
 * The same flat-array-of-entries shape `sections/registry.ts` and
 * `AGENT_COMMAND_GROUPS` use elsewhere: a page is added by appending a row to
 * `SETUP_PAGES`, never by editing `setup-overlay.tsx`'s frame.
 *
 * There is no `optional` flag any more: every page between the intro and the
 * finale is optional by rule, so a per-row flag could only ever be `true`.
 */
export type SetupPage = {
  /** Stable id — never the array index, since `setupState.skippedPageIds` and
   *  `lastPageId` (`ui-store.ts`) persist it across a reorder. */
  id: string;
  /** The page's short name — the dialog's accessible name and its dot's label. */
  title: string;
  /** The heading the page shows (and Theme B types out character by character). */
  titleTyped: string;
  /**
   * Whether Next is enabled. Omitted means always — the usual case, since a
   * page is optional. A page that cannot sensibly be passed half-done (a form
   * mid-submit, say) returns `false` until it can.
   */
  canAdvance?: () => boolean;
  Component: ComponentType;
};
