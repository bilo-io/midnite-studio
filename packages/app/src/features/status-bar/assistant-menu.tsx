import { useRef } from 'react';

import { BrandMark } from '../../components/brand';
import { fabCompanionState } from '../companion/companion-look';
import { FabLoopHalo, fabGlowClass, useAnyLoopRunning } from '../loops/fab-loop-halo';
import { captureFabMorphOrigin, useFabMorphRef } from '../loops/fab-morph';
import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';

/**
 * The statusbar's rightmost segment.
 *
 * Renders **only** while the Loops or the Companion panel is open and
 * docked, wearing a miniature of the FAB itself — same brand mark, same loop
 * glow/halo, same `data-companion-state` look — so closing whichever panel
 * is open never needs a second control to hunt for. Renders `null`
 * otherwise: with the big FAB hidden for that same duration (`app.tsx`),
 * this segment and the large FAB are exact complements, so there is exactly
 * one FAB on screen at all times, never a stray second control here. The
 * FLIP transform in `fab-morph.ts` is what sells the two as one button
 * moving rather than one disappearing and another appearing in its place.
 *
 * This used to also wear a quick-access trigger button while neither panel
 * was open — removed because it was a redundant second control for the same
 * `toggleQuickAccess()` action the large FAB's own `onClick` already calls,
 * and the two conditions are complements, so the large FAB was always on
 * screen whenever this one rendered. The large FAB and the `Mod+l` chord
 * (`fab.toggle`) are now `QuickAccessMenu`'s only entry points; this
 * component no longer opens it at all.
 *
 * Both panels can be open at once (Decision 4, `companion-panel.tsx`), but
 * this is still a single button — a click has to close exactly one panel, so
 * `lastOpenedPanel` (`ui-store.ts`) breaks the tie by recency: the mini FAB
 * always represents, and closes, whichever of the two was opened most
 * recently.
 */
export function AssistantMenu() {
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

  return null;
}
