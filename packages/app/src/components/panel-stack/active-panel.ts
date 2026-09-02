import { useEffect } from 'react';

import type { PanelHistory } from './use-panel-history';

/**
 * Routes the global `Mod+[`/`Mod+]` chords to whichever `panel-stack` is
 * currently on screen (Phase 42 Theme D).
 *
 * A plain module-level ref, not a zustand store — `panel-stack` is
 * deliberately `useState`-based and panel-local (see `use-panel-history.ts`'s
 * own docblock), and this registry holds only two function references, never
 * the history data itself. `useCommandHandlers` lives outside the Councils
 * component tree, so a chord reaching it has nowhere else to call into: the
 * command registry is the single source of truth for every chord
 * (`CLAUDE.md`), which rules out a chord bound locally inside `CouncilsView`.
 *
 * Registering `null` (or never registering at all) makes `back`/`forward`
 * safe no-ops, which is what "the handler no-ops unless the Councils panel
 * is active" means in practice — there is nothing to check *for*, only
 * something that may or may not have signed up.
 */
type ActivePanelControls = { back: () => void; forward: () => void };

let active: ActivePanelControls | null = null;

export function activePanelBack(): void {
  active?.back();
}

export function activePanelForward(): void {
  active?.forward();
}

/** Call from the component that owns the on-screen `panel-stack`. */
export function useRegisterActivePanel<T>(history: PanelHistory<T>, isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return undefined;
    // A fresh object per effect run, so cleanup can check it still owns the
    // slot before clearing it — two overlapping registrations (there should
    // never be more than one Councils panel, but nothing enforces that)
    // otherwise let the first one's unmount clobber the second's still-live
    // registration.
    const controls: ActivePanelControls = { back: history.back, forward: history.forward };
    active = controls;
    return () => {
      if (active === controls) active = null;
    };
  }, [isActive, history.back, history.forward]);
}
