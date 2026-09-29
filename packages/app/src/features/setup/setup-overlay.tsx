import { useEffect, useRef, useState } from 'react';
import { LuStethoscope, LuX } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { ONBOARDING_STEPS } from './onboarding-steps';

/**
 * The first-run wizard (Phase 90 Theme I).
 *
 * There is no setup wizard elsewhere in this app — the phase doc's own
 * grounding names `setup-dialog.tsx`'s `Phase` type as a *render lifecycle*,
 * not a step list, and this component's previous shape (a single screen,
 * three hard-coded status rows, one "Get Started" button) was the other half
 * of that finding. This is the step frame that was missing, built once and
 * driven entirely by `ONBOARDING_STEPS` — a new step is a row appended there,
 * never a change here.
 *
 * It keeps the focus trap and `role`/`aria-modal` skeleton Phase 68 Theme D
 * put on the single-screen version, copied from `setup-dialog.tsx`'s own —
 * see that file's docblock for why this shape is the one to copy.
 */
export function OnboardingModal() {
  const showOnboarding = useUiStore((s) => s.showOnboarding);
  const setShowOnboarding = useUiStore((s) => s.setShowOnboarding);
  const setOnboardingStepSkipped = useUiStore((s) => s.setOnboardingStepSkipped);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Called before the early return, because a hook cannot be conditional;
  // `showOnboarding` is what makes both inert while the modal is closed.
  useFocusTrap(containerRef, showOnboarding);

  // This component stays mounted (behind `if (!showOnboarding) return null`
  // below) for the app's whole lifetime, so a stale `stepIndex` from a
  // previous visit would otherwise survive a close and reopen — there is no
  // "replay onboarding" entry point today, but nothing should depend on that
  // staying true.
  useEffect(() => {
    if (showOnboarding) setStepIndex(0);
  }, [showOnboarding]);

  /*
    "Skip the rest", not "cancel" — the phase doc's own rule for Escape and
    the close button. Every optional step from here to the end is recorded
    as skipped (so `accounts-page.tsx` can offer it again) rather than the
    modal simply vanishing with no trace of what the user never reached.
    Step one is mandatory and is never in that slice once it has been shown
    at all, so this never marks the welcome step.
  */
  const skipRestAndClose = (): void => {
    for (const step of ONBOARDING_STEPS.slice(stepIndex)) {
      if (step.optional) setOnboardingStepSkipped(step.id, true);
    }
    setShowOnboarding(false);
  };

  // `dialog` layer, blocking — the defaults `useDismiss` already ships,
  // matching every other modal in the app (Phase 62). Registered only while
  // open, same gate as the focus trap above.
  useDismiss(showOnboarding, skipRestAndClose);

  if (!showOnboarding) return null;

  // Non-null: `stepIndex` only ever moves via `back`/`proceed`/`skip` below,
  // each of which clamps or checks against `ONBOARDING_STEPS.length` before
  // changing it.
  const step = ONBOARDING_STEPS[stepIndex]!;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

  const back = (): void => setStepIndex((index) => Math.max(0, index - 1));

  const skip = (): void => {
    setOnboardingStepSkipped(step.id, true);
    if (isLast) {
      setShowOnboarding(false);
    } else {
      setStepIndex((index) => index + 1);
    }
  };

  // Continuing is engaging with the step, not skipping it — clears a skip
  // recorded on a previous visit (the Accounts page's "offer it again" path
  // lands back here at this same step).
  const proceed = (): void => {
    setOnboardingStepSkipped(step.id, false);
    if (isLast) {
      setShowOnboarding(false);
    } else {
      setStepIndex((index) => index + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg flex flex-col gap-4"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 font-medium text-foreground text-sm">
            <LuStethoscope className="h-4 w-4 text-primary" />
            <span>{step.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {ONBOARDING_STEPS.length > 1 ? (
              <span className="text-[11px] text-muted-foreground">
                Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
              </span>
            ) : null}
            <button
              type="button"
              aria-label="Close"
              onClick={skipRestAndClose}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LuX aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>

        <step.Component />

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={back}
            disabled={isFirst}
            className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            {step.optional ? (
              <button
                type="button"
                onClick={skip}
                className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Skip
              </button>
            ) : null}
            <button
              type="button"
              onClick={proceed}
              className="rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
