import { useEffect } from 'react';

import { useCompanionStore } from '../../store/companion-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Keeps the companion's state machine in agreement with its master switch —
 * the wiring Theme A's own note deferred to Theme C ("the panel sends `enable`
 * when the setting turns on").
 *
 * Mounted at the app root, **not** inside the panel, and that placement is the
 * whole point. The machine's value is read by three surfaces that are visible
 * while the panel is *closed*: the FAB's `data-companion-state`, the mini FAB
 * in the status bar, and the quick-access popover's strip. If `enable` were
 * sent on the panel's mount, all three would read `off` — and render "Off" —
 * for a companion the user had switched on and simply not opened.
 *
 * `send`, never a direct assignment: `transition` is total and `enable` from
 * any live state is idempotent (it returns the state it was already in), so a
 * re-render mid-sentence cannot reset anything. `disable` wins from anywhere,
 * which is what makes flipping the switch off mid-utterance work.
 */
export function useCompanionEnabledSync(): void {
  const enabled = useUiStore((s) => s.companionEnabled);

  useEffect(() => {
    useCompanionStore.getState().send(enabled ? 'enable' : 'disable');
  }, [enabled]);
}
