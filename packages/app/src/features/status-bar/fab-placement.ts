import { useLayoutEffect, useRef, type RefObject } from 'react';

import { motionMs } from '../../components/use-reveal';
import type { ViewId } from '../../store/ui-store';

/**
 * Where the quick-access FAB lives. On Media views its floating bottom-right
 * spot covers the composers' Send button, and with the terminal docked the
 * terminal panel paints over that spot (the FAB vanishes), so it docks into
 * the status bar in both cases; everywhere else it floats as before.
 */
export type FabPlacement = 'floating' | 'statusbar';

export function fabPlacementFor({
  view,
  terminalOpen,
}: {
  view: ViewId;
  terminalOpen: boolean;
}): FabPlacement {
  return view === 'media' || terminalOpen ? 'statusbar' : 'floating';
}

/**
 * FLIP the FAB between its two homes. The button mounts in a different parent
 * on a placement change, so the old rect is read during render (the old node
 * is still attached) and the new node animates from it in a layout effect.
 */
export function animateFabPlacement(el: HTMLElement, from: DOMRect): Animation | null {
  const ms = motionMs();
  const to = el.getBoundingClientRect();
  if (ms === 0 || to.width === 0 || to.height === 0 || typeof el.animate !== 'function') {
    return null;
  }
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transform: 'none' },
    ],
    { duration: ms, easing: 'ease-in-out' },
  );
}

export function useFabPlacementFlip(
  placement: FabPlacement,
  buttonRef: RefObject<HTMLElement | null>,
): void {
  const prev = useRef(placement);
  const origin = useRef<DOMRect | null>(null);
  if (prev.current !== placement && !origin.current) {
    origin.current = buttonRef.current?.getBoundingClientRect() ?? null;
  }
  useLayoutEffect(() => {
    prev.current = placement;
    const from = origin.current;
    origin.current = null;
    const el = buttonRef.current;
    if (!from || !el) return undefined;
    const anim = animateFabPlacement(el, from);
    return () => anim?.cancel();
  }, [placement, buttonRef]);
}
