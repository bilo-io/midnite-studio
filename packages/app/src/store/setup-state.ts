/**
 * The setup overlay's one persisted gate (Phase 98 Theme A).
 *
 * Replaces the two latches the old first-run surfaces kept apart —
 * `onboardedAt` (the health-check `FirstRunModal`) and `showOnboarding` (the
 * two-step `OnboardingModal`) — plus the wizard's `onboardingSkippedStepIds`.
 * Two latches for one first run is how a fresh profile came to stack two
 * full-window modals on top of each other.
 *
 * Plain data and pure functions, so `ui-store.ts`'s `migrate` and the overlay
 * both read the same rules without importing each other.
 */
export type SetupState = {
  /** Set by the finale's Get started. Once set, setup never opens by itself again. */
  completedAt: string | null;
  /** Set by X, Skip > or Escape. Also ends the first-run auto-open. */
  dismissedAt: string | null;
  /** The page showing when setup was last left, so a resume has somewhere to go. */
  lastPageId: string | null;
  /**
   * Pages the user left through Skip >, by `SetupPage['id']`. Read back by
   * Settings ▸ Accounts to say "you skipped this" and offer it again.
   */
  skippedPageIds: string[];
  /** The forges ticked on the setup overlay's forge page (Theme E) — `ForgeKind` ids; drives the CLI page's rows. */
  forges: string[];
};

export const INITIAL_SETUP_STATE: SetupState = {
  completedAt: null,
  dismissedAt: null,
  lastPageId: null,
  skippedPageIds: [],
  forges: [],
};

/** The pre-v28 fields the migration reads. All optional — any of them may be absent. */
export type LegacyOnboardingState = {
  onboardedAt?: unknown;
  showOnboarding?: unknown;
  onboardingSkippedStepIds?: unknown;
};

/**
 * Old latches → new gate.
 *
 * Either old latch being closed counts as done: someone who got past either
 * modal has already been greeted, and the overlay must never re-pop for an
 * existing user (the phase's "first run only" guardrail). `welcome` is dropped
 * from the skip list — it was the old wizard's mandatory first step and has no
 * page here; every other id carries over as-is.
 */
export function migrateSetupState(legacy: LegacyOnboardingState, now: string): SetupState {
  const onboardedAt = typeof legacy.onboardedAt === 'string' ? legacy.onboardedAt : null;
  const done = onboardedAt !== null || legacy.showOnboarding === false;
  const skipped = Array.isArray(legacy.onboardingSkippedStepIds)
    ? legacy.onboardingSkippedStepIds.filter(
        (id): id is string => typeof id === 'string' && id !== 'welcome',
      )
    : [];
  return {
    ...INITIAL_SETUP_STATE,
    completedAt: done ? (onboardedAt ?? now) : null,
    skippedPageIds: [...new Set(skipped)],
  };
}

/** Whether setup should open by itself: never finished, never left. */
export function isFirstRun(state: SetupState): boolean {
  return state.completedAt === null && state.dismissedAt === null;
}

/** Add or remove one id from `skippedPageIds`, never duplicating it. */
export function withPageSkipped(ids: readonly string[], pageId: string, skipped: boolean): string[] {
  if (skipped) return ids.includes(pageId) ? [...ids] : [...ids, pageId];
  return ids.filter((id) => id !== pageId);
}
