import type { ComponentType } from 'react';

/**
 * One step of the onboarding wizard (Phase 90 Theme I).
 *
 * The same flat-array-of-entries shape
 * [`sections/registry.ts`](../../../../website/src/sections/registry.ts) and
 * `AGENT_COMMAND_GROUPS` already use elsewhere in this codebase: a step is
 * added by appending a row to `ONBOARDING_STEPS`, never by editing
 * `onboarding-modal.tsx`'s frame.
 */
export type WizardStep = {
  /** Stable id — never the array index, since `onboardingSkippedStepIds`
   *  (`ui-store.ts`) persists it across a reorder. */
  id: string;
  /** The modal's header while this step is showing. */
  title: string;
  /**
   * Whether Skip renders for this step. A Skip on a mandatory step is a lie
   * — see `onboarding-modal.tsx`'s footer for the rule this drives.
   */
  optional: boolean;
  Component: ComponentType;
};
