import { useEffect, useRef } from 'react';

import { useAllLoopStatuses } from './loop-status';
import { loopLabel, useAllLoops } from './use-all-loops';
import { useToastStore } from '../../store/toast-store';
import { useUiStore, type FabTab } from '../../store/ui-store';

/**
 * Notify once when a live loop starts waiting on you (Phase 35 Theme E).
 *
 * Mounted from `App`, not from the FAB panel — the whole point of the notice
 * is a loop that went quiet while the panel was closed, and a hook inside the
 * panel would only fire for loops you were already watching.
 *
 * Debounced by *transition*, not by time: the previous waiting-ness of each
 * loop is remembered, so a run that sits at a permission prompt for ten
 * minutes produces exactly one notification, and a run that asks three
 * separate questions produces three. Going not-waiting rearms it.
 */
export function useLoopAttention(): void {
  const loops = useAllLoops();
  const statuses = useAllLoopStatuses(loops.map((loop) => loop.id));
  const openFabTab = useUiStore((s) => s.openFabTab);
  const wasWaiting = useRef<Record<string, boolean>>({});

  /*
    A bitmask over the loops, not the status array.

    `useAllLoopStatuses` builds a fresh array every render, so depending on it
    directly re-ran this effect on every render of the app root — and worse,
    made the rearm *render-observed*: a loop that went waiting → stopped →
    started → waiting again without an intervening render would have its
    second question swallowed, because the effect never saw the not-waiting
    frame in between. A string of the waiting bits changes exactly when the
    thing this effect cares about changes.
  */
  const waitingMask = statuses.map((status) => (status.waiting ? '1' : '0')).join('');
  // Custom loops come and go, so the mask's positions are only meaningful
  // against the list they were read from — the effect re-reads it with them.
  const loopsRef = useRef(loops);
  loopsRef.current = loops;

  useEffect(() => {
    loopsRef.current.forEach((loop, index) => {
      const waiting = waitingMask[index] === '1';
      const previously = wasWaiting.current[loop.id] ?? false;
      wasWaiting.current[loop.id] = waiting;
      if (!waiting || previously) return;

      useToastStore.getState().addToast({
        message: `${loopLabel(loop)} is waiting for input.`,
        status: 'warning',
        action: { label: `Open ${loopLabel(loop)}`, onAction: () => openFabTab(loop.id as FabTab) },
      });
    });
  }, [waitingMask, openFabTab]);
}
