import { Accordion } from '@bilo-io/ui';
import { LuTrash2 } from 'react-icons/lu';

import { useDialogs } from '../../../components/dialog-host';
import { useUiStore } from '../../../store/ui-store';
import { Field } from './controls';

/**
 * Phase 74 Theme D's opt-in, copying `GitSafetyPage`'s shape exactly — that
 * file's own reasoning, "a switch that turns on a real force-push is a
 * different weight of decision… it deserves a page a user has to go looking
 * for," applies with more force to a switch with no undo at all than to one
 * with a lease-checked one.
 *
 * Emptying the Trash gets its own consent pair
 * (`allowTrashEmpty`/`trashEmptyConsentGiven`), never
 * `allowSystemCacheClean`/`systemCacheConsentGiven` — a dev-tool cache is
 * something a build tool put there and can put back; the Trash's contents
 * are things the user put there, from any app, with an explicit expectation
 * of recoverability that survives right up until the moment it is emptied.
 */
export function TrashSafetyPage() {
  const dialogs = useDialogs();
  const allowTrashEmpty = useUiStore((s) => s.allowTrashEmpty);
  const setAllowTrashEmpty = useUiStore((s) => s.setAllowTrashEmpty);
  const trashEmptyConsentGiven = useUiStore((s) => s.trashEmptyConsentGiven);
  const setTrashEmptyConsentGiven = useUiStore((s) => s.setTrashEmptyConsentGiven);

  // The checkbox opens the dialog; the dialog sets the checkbox — same shape
  // as `OptimizerSettingsPage`'s `SystemCachesSection`. Consent is a fact
  // about what the user was shown, not a live permission: once
  // `trashEmptyConsentGiven` is true, toggling off and back on does not
  // re-ask. Only a fresh install/profile sees the dialog.
  const handleToggle = (checked: boolean): void => {
    if (!checked) {
      setAllowTrashEmpty(false);
      return;
    }
    if (trashEmptyConsentGiven) {
      setAllowTrashEmpty(true);
      return;
    }
    dialogs.confirm({
      title: 'Allow emptying the Trash?',
      body: "Emptying the Trash permanently deletes everything in it — including anything another app put there, not just Midnite. Unlike every other delete in this app, this does not go through the Trash first, because this operation is the Trash's own last step. There is no undo. macOS may ask a second time; that dialog is Finder's, not ours.",
      confirmLabel: 'I understand',
      danger: true,
      onConfirm: () => {
        setAllowTrashEmpty(true);
        setTrashEmptyConsentGiven(true);
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Empty Trash" icon={<LuTrash2 className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Allow emptying the Trash"
            hint="Adds an Empty Trash card to the Optimizer's Storage tab. Emptying is permanent — it asks Finder to do it, and there is no undo. Nothing else in Midnite Studio ever deletes without moving to the Trash first."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={allowTrashEmpty}
                onChange={(event) => handleToggle(event.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Allow emptying the Trash
            </label>
          </Field>

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">What this still never does</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>No selective emptying — it is all or nothing, like Finder&rsquo;s own menu item.</li>
              <li>No scheduled or automatic emptying.</li>
              <li>
                No <code>rm</code> — the request goes to Finder, which is what handles locked and
                in-use items.
              </li>
            </ul>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
