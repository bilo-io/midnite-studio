import { HealthChecklist } from '../../settings/settings-pages/health-page';

/**
 * Step one — mandatory, no `Skip` (`ONBOARDING_STEPS`'s `optional: false`).
 *
 * Phase 90 Theme I's own finding: the three rows this step showed before were
 * literals — `"Git Binary" / "System / Dugite"`, `"/bin/zsh"`, `"midnite-studio"`
 * — asserted regardless of what the machine actually has, which is worse than
 * showing nothing on a machine that genuinely lacks one of them. `HealthChecklist`
 * (`settings/settings-pages/health-page.tsx`) already reads the real answer over
 * `window.midniteStudio.systemHealth()` — `first-run-modal.tsx`'s own `compact`
 * mode is the existing proof this component is first-run-appropriate — so this
 * step reuses it rather than re-deriving the same three facts a second way.
 */
export function WelcomeStep() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Your workspace setup for Git, terminal brokers, and embedded developer tools is ready.
      </p>
      <div className="rounded border border-border bg-muted/40 p-1">
        <HealthChecklist compact />
      </div>
    </div>
  );
}
