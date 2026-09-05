import { useRef, useState } from 'react';

import { BrandMark } from '../../components/brand';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import { QuickAccessMenu } from '../quick-access/quick-access-menu';
import { FabLoopHalo, fabGlowClass, useAnyLoopRunning } from '../loops/fab-loop-halo';
import { captureFabMorphOrigin, useFabMorphRef } from '../loops/fab-morph';
import { useUiStore } from '../../store/ui-store';

/**
 * The statusbar's rightmost segment.
 *
 * While the FAB panel is closed this is the trigger for the quick-access menu
 * (Phase 58 Theme E) — "Midnite Assistant Menu (Blank for now)" until then.
 * While the panel is open, this slot instead wears a miniature of the FAB
 * itself — same brand mark, same loop glow/halo, same toggle — so closing the
 * panel never needs a second control to hunt for. The two looks share one
 * statusbar segment rather than sitting side by side: with the big FAB hidden
 * for the same duration (`app.tsx`), there is exactly one FAB on screen at
 * all times, and the FLIP transform in `fab-morph.ts` is what sells the two
 * as one button moving rather than one disappearing and another appearing in
 * its place.
 *
 * `QuickAccessMenu` is self-contained (its own portal, position, Escape and
 * occluder registration — see its own doc comment), so this trigger's local
 * `open` state is all the chrome it needs here; the FAB's own entry point
 * (`app.tsx`) mounts the exact same component off the shared `quickAccessOpen`
 * flag instead — two independent mounts of one component, never a fork.
 */
export function AssistantMenu() {
  const [open, setOpen] = useState(false);
  const fabPanelOpen = useUiStore((s) => s.fabPanelOpen);
  const fabDetached = useUiStore((s) => s.fabDetached);
  const toggleFabPanel = useUiStore((s) => s.toggleFabPanel);
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const loopsRunning = useAnyLoopRunning();
  const miniFabRef = useRef<HTMLButtonElement | null>(null);
  const miniFabMorphRef = useFabMorphRef(miniFabRef);

  // Detaching collapses the docked panel but leaves `fabPanelOpen` itself
  // untouched (so re-docking can expand it straight back, `app.tsx`) — this
  // segment has to read `fabDetached` too, or it would wear the "open"
  // look for a panel that is not actually showing here.
  if (fabPanelOpen && !fabDetached) {
    return (
      <div className="relative flex h-4 w-4 items-center justify-center">
        <FabLoopHalo tab={activeFabTab} compact />
        <button
          ref={miniFabMorphRef}
          type="button"
          onClick={() => {
            captureFabMorphOrigin(miniFabRef.current);
            toggleFabPanel();
          }}
          aria-label="Close quick access panel"
          title="Quick Access"
          data-testid="assistant-menu"
          data-loops-running={loopsRunning.running ? 'true' : undefined}
          data-fab-tab={activeFabTab}
          // `relative`, same reason as the large FAB: the halo sits at
          // `-z-10` behind this button and needs it to not be a static box.
          className={`relative flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-110 active:scale-95 ${fabGlowClass(loopsRunning)}`}
        >
          <BrandMark className="h-full w-full" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Midnite Assistant"
        data-testid="assistant-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded px-1 transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent"
        data-open={open}
      >
        <MidniteIcon aria-hidden className="h-3.5 w-3.5" />
      </button>
      {open ? <QuickAccessMenu onClose={() => setOpen(false)} /> : null}
    </>
  );
}
