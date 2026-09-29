import { HealthChecklist } from '../../settings/settings-pages/health-page';

/**
 * The machine-check page — the old wizard's welcome step and `FirstRunModal`'s
 * body, folded into one page (Phase 98 Theme A). Interim: Themes D, E and H
 * replace it with the catalogue-driven git and toolchain pages.
 *
 * Phase 90 Theme I's own finding still holds: the rows this shows used to be
 * literals asserted regardless of the machine. `HealthChecklist`
 * (`settings/settings-pages/health-page.tsx`) reads the real answer over
 * `window.midniteStudio.systemHealth()`, so this page reuses it rather than
 * re-deriving the same facts a second way.
 */
export function MachineCheckPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        What this Mac already has for git, the terminal and the Midnite CLI.
      </p>
      <div className="rounded border border-border bg-muted/40 p-1">
        <HealthChecklist compact />
      </div>
    </div>
  );
}
