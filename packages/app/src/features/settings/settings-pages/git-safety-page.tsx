import { Accordion } from '@bilo-io/ui';
import { LuShieldAlert } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { Field } from './controls';

/**
 * Phase 22 Theme F's opt-in, its own settings section rather than a row on
 * the existing Repositories page — a switch that turns on a real force-push
 * is a different weight of decision than a sync interval or a filter default,
 * and it deserves a page a user has to go looking for, not one they scroll
 * past on the way to something else.
 */
export function GitSafetyPage() {
  const allowForceWithLease = useUiStore((s) => s.allowForceWithLease);
  const setAllowForceWithLease = useUiStore((s) => s.setAllowForceWithLease);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Force-push" icon={<LuShieldAlert className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Allow force-push (with lease)"
            hint="Offers a force-push option on the ref badge menu, but only once a plain push has already been rejected as non-fast-forward, and only ever as --force-with-lease against the exact remote sha you were shown."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={allowForceWithLease}
                onChange={(event) => setAllowForceWithLease(event.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Allow force-push (with lease)
            </label>
          </Field>

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">What this still never does</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>No bare <code>--force</code> — every push this app can build is either a plain push or an explicit <code>--force-with-lease=&lt;ref&gt;:&lt;sha&gt;</code>.</li>
              <li>No <code>--delete</code> from this switch — deleting a remote branch is a separate, already-existing confirm.</li>
              <li>No bypass of a branch protection rule the remote already enforces — this app has no local concept of "protected," so a push GitHub would reject still comes back rejected, with the same message it always has.</li>
            </ul>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
