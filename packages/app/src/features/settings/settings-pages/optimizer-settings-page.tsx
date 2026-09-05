import { Accordion } from '@bilo-io/ui';
import { LuGauge } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { Field } from './controls';

/**
 * Phase 59 Theme A's opt-in, mirroring `GitSafetyPage`'s shape exactly: a
 * default-off switch behind its own settings section, since scanning and
 * deleting across every registered repo/worktree — and listing/killing
 * system processes — is a different weight of decision than a sync interval.
 */
export function OptimizerSettingsPage() {
  const optimizerEnabled = useUiStore((s) => s.optimizerEnabled);
  const setOptimizerEnabled = useUiStore((s) => s.setOptimizerEnabled);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Workspace Optimizer" icon={<LuGauge className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Enable Workspace Optimizer"
            hint="Adds an Optimizer view with Smart Scan, Storage, Memory and GPU tabs, pointed at the repos/worktrees this app manages plus one folder you pick per scan — never an unscoped disk crawl."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={optimizerEnabled}
                onChange={(event) => setOptimizerEnabled(event.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Enable Workspace Optimizer
            </label>
          </Field>

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">What this still never does</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>No sudo and no GPU temperature — the load probe already made that call.</li>
              <li>Delete moves items to the trash, never a bare recursive unlink.</li>
              <li>A kill still asks first, with the process name and full command line shown.</li>
            </ul>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
