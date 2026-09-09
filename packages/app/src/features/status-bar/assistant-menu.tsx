import { useRef } from 'react';

import { BrandMark } from '../../components/brand';
import { fabCompanionState } from '../companion/companion-look';
import { MidniteIcon } from '../../components/icons/midnite-icon';
import { FabLoopHalo, fabGlowClass, useAnyLoopRunning } from '../loops/fab-loop-halo';
import { captureFabMorphOrigin, useFabMorphRef } from '../loops/fab-morph';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';

/**
 * The statusbar's rightmost segment.
 *
 * While neither the Loops nor the Companion panel is open this is the
 * trigger for the quick-access menu (Phase 58 Theme E) — "Midnite Assistant
 * Menu (Blank for now)" until then. While either is open, this slot instead
 * wears a miniature of the FAB itself — same brand mark, same loop
 * glow/halo, same `data-companion-state` look — so closing whichever panel
 * is open never needs a second control to hunt for. The two looks share one
 * statusbar segment rather than sitting side by side: with the big FAB
 * hidden for the same duration (`app.tsx`), there is exactly one FAB on
 * screen at all times, and the FLIP transform in `fab-morph.ts` is what
 * sells the two as one button moving rather than one disappearing and
 * another appearing in its place.
 *
 * Both panels can be open at once (Decision 4, `companion-panel.tsx`), but
 * this is still a single button — a click has to close exactly one panel, so
 * `lastOpenedPanel` (`ui-store.ts`) breaks the tie by recency: the mini FAB
 * always represents, and closes, whichever of the two was opened most
 * recently.
 *
 * This trigger button is deliberately the ONLY thing this component renders
 * for `QuickAccessMenu` — it toggles the shared `quickAccessOpen` flag but
 * does not itself mount the menu. `app.tsx` mounts the single instance, once,
 * off that same flag. Two entry points that each conditionally rendered their
 * own `<QuickAccessMenu>` off the one shared flag looked like "one component,
 * two mounts" but both conditionals go true together the instant either
 * trigger flips it — since both are always in the tree, that is two menus on
 * screen at once, not one. A single render site is what "one component, two
 * entry points" actually requires: two buttons, one overlay.
 */
export function AssistantMenu() {
  const quickAccessOpen = useUiStore((s) => s.quickAccessOpen);
  const toggleQuickAccess = useUiStore((s) => s.toggleQuickAccess);
  const fabPanelOpen = useUiStore((s) => s.fabPanelOpen);
  const fabDetached = useUiStore((s) => s.fabDetached);
  const toggleFabPanel = useUiStore((s) => s.toggleFabPanel);
  const companionPanelOpen = useUiStore((s) => s.companionPanelOpen);
  const companionEnabled = useUiStore((s) => s.companionEnabled);
  const companionDetached = useUiStore((s) => s.companionDetached);
  const setCompanionPanelOpen = useUiStore((s) => s.setCompanionPanelOpen);
  const lastOpenedPanel = useUiStore((s) => s.lastOpenedPanel);
  const activeFabTab = useUiStore((s) => s.activeFabTab);
  const loopsRunning = useAnyLoopRunning();
  const companionState = useCompanionStore((s) => s.state);
  const miniFabRef = useRef<HTMLButtonElement | null>(null);
  const miniFabMorphRef = useFabMorphRef(miniFabRef);

  /*
    Detaching collapses a docked panel but leaves that panel's own open flag
    untouched (so re-docking can expand it straight back, `app.tsx`) — this
    segment has to read both `*Detached` flags too, or it would wear the
    "open" look for a panel that is not actually showing here. The companion
    additionally needs its master switch, mirroring `app.tsx`'s own
    `companionDocked`: a disabled companion is not on screen either, whatever
    `companionPanelOpen` says.
  */
  const fabPanelDocked = fabPanelOpen && !fabDetached;
  const companionDocked = companionPanelOpen && companionEnabled && !companionDetached;

  // Recency breaks the tie when both are docked; either alone needs no
  // tiebreaker at all.
  const activePanel: 'fab' | 'companion' | null =
    fabPanelDocked && companionDocked
      ? (lastOpenedPanel ?? 'fab')
      : fabPanelDocked
        ? 'fab'
        : companionDocked
          ? 'companion'
          : null;

  if (activePanel) {
    const isCompanion = activePanel === 'companion';
    return (
      <div className="relative flex h-4 w-4 items-center justify-center">
        <FabLoopHalo tab={activeFabTab} compact />
        <button
          ref={miniFabMorphRef}
          type="button"
          onClick={() => {
            captureFabMorphOrigin(miniFabRef.current);
            if (isCompanion) setCompanionPanelOpen(false);
            else toggleFabPanel();
          }}
          aria-label={isCompanion ? 'Close the Companion' : 'Close quick access panel'}
          title={isCompanion ? 'Companion' : 'Quick Access'}
          data-testid="assistant-menu"
          data-loops-running={loopsRunning.running ? 'true' : undefined}
          data-fab-tab={activeFabTab}
          /* Phase 79 Theme H — the mini FAB wears the same four looks as the
             large one, from the one table (`companion-look.ts`). The two swap
             places with a FLIP transform, so a state visible on one and absent
             on the other would read as the button losing its glow mid-flight.
             Set regardless of which panel is currently driving the click —
             the large FAB carries both `data-fab-tab` and
             `data-companion-state` unconditionally too (`app.tsx`). */
          data-companion-state={fabCompanionState(companionState)}
          // `relative`, same reason as the large FAB: the halo sits at
          // `-z-10` behind this button and needs it to not be a static box.
          className={`companion-face companion-face--primary relative flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-110 active:scale-95 ${fabGlowClass(loopsRunning)}`}
        >
          <BrandMark className="h-full w-full" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={quickAccessOpen}
      aria-haspopup="menu"
      aria-label="Midnite Assistant"
      data-testid="assistant-menu"
      onClick={toggleQuickAccess}
      className="flex items-center gap-3 rounded px-1 transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent"
      data-open={quickAccessOpen}
    >
      <MidniteIcon aria-hidden className="h-3.5 w-3.5" />
    </button>
  );
}
