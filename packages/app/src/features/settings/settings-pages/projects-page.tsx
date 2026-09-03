import { Accordion } from '@bilo-io/ui';
import { useState } from 'react';
import { LuCheck, LuCopy, LuInfo, LuPlay, LuShieldAlert } from 'react-icons/lu';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { Field } from './controls';

/** How the fix is spelled — shown verbatim, matching `MissingScopeState` in `projects-view.tsx`. */
const SCOPE_FIX_COMMAND = 'gh auth refresh -s project';

/**
 * Projects (Phase 40 Theme F) — the scope-refresh instructions in one durable
 * place, plus what the view's own two limits mean, so a user does not have to
 * rediscover either mid-triage.
 *
 * No board picker here: which board a repo remembers is set by picking one in
 * the Projects view itself, one click away — a second control for the same
 * state here would be a second place to keep in sync with it.
 */
export function ProjectsPage() {
  const launchAndRunEnabled = useUiStore((s) => s.launchAndRunEnabled);
  const setLaunchAndRunEnabled = useUiStore((s) => s.setLaunchAndRunEnabled);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Launch and run" icon={<LuPlay className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Allow launch-and-run from a card"
            hint="Reveals a second button beside Start on a card's composer, beside the existing type-but-don't-send default. Pressing it still shows a confirm dialog with the exact composed command first — this setting only removes the extra step of reaching the button, not the look-before-you-leap."
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={launchAndRunEnabled}
                onChange={(event) => setLaunchAndRunEnabled(event.target.checked)}
                className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
              />
              Allow launch-and-run from a card
            </label>
          </Field>

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">Why this stays off by default</p>
            <p>
              A card's prompt is composed from an issue or PR's own title and body — remote text any
              contributor to the repository could have written, unlike a FAB loop's fixed,
              user-authored prompt. The confirm dialog names that source every time, on or off.
            </p>
          </div>
        </div>
      </Accordion>

      <Accordion title="Missing permission" icon={<LuShieldAlert className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            ProjectV2 requires the <code>project</code> scope, which <code>gh auth login</code> does
            not grant by default. If the Projects view shows a missing-permission state, run this in
            a terminal and reopen it:
          </p>
          <ScopeFixCommand />
        </div>
      </Accordion>

      <Accordion title="How this works" icon={<LuInfo className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-3 p-3">
          <div>
            <p className="text-xs font-medium">Default board</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each repository remembers the last board you picked in the Projects view and opens on
              it next time — set it there, not here.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium">Item ceiling</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A board loads its first 1,000 items. Past that, the view says so rather than silently
              dropping the rest.
            </p>
          </div>
        </div>
      </Accordion>
    </div>
  );
}

function ScopeFixCommand() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2.5 py-1.5">
      <code className="text-xs">{SCOPE_FIX_COMMAND}</code>
      <button
        type="button"
        aria-label="Copy command"
        onClick={() => {
          void bridge()
            ?.clipboard.writeText({ text: SCOPE_FIX_COMMAND })
            .then((result) => {
              if (result?.ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            });
        }}
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {copied ? <LuCheck aria-hidden className="h-3.5 w-3.5" /> : <LuCopy aria-hidden className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
