import { useCallback, type RefCallback, type RefObject } from 'react';

import { motionMs } from '../../components/use-reveal';

/**
 * FLIP transform between the large FAB and the statusbar's mini version of
 * it — whichever button a click just hid stashes its rect here, and the one
 * that mounts in its place reads it back to animate in from there (and to
 * take over its focus) instead of just appearing. A single module-level slot
 * is enough: only one of the two buttons is ever mounted at a time, and the
 * stash-then-mount happens inside one synchronous click handler, so there is
 * never a second writer to race.
 *
 * A toggle with no button behind it (the `fab.toggle` command, a
 * waiting-loop notification opening a tab, a loop launcher chip closing the
 * panel) leaves this `null`, and the button that mounts just appears at
 * rest — there is no on-screen origin, or focus, to take over.
 */
let originRect: DOMRect | null = null;

export function captureFabMorphOrigin(el: HTMLElement | null): void {
  originRect = el?.getBoundingClientRect() ?? null;
}

/**
 * A ref CALLBACK for the FAB/mini-FAB button, not a `useLayoutEffect` on a
 * ref object — the button is conditionally rendered (`{!fabPanelOpen ?
 * <button ref={...}> : null}`), mounting and unmounting on every panel
 * toggle, and a plain effect with an empty dependency array runs once for
 * the lifetime of whichever component calls this hook (`Shell`,
 * `AssistantMenu`), not once per mount of the button itself — so it would
 * only ever see the FIRST mount and never animate a real toggle. A ref
 * callback fires exactly when React attaches this specific DOM node, every
 * time, which is what "on mount" actually needs to mean here.
 *
 * Also stands in for a plain `useRef`: `target.current` is kept in sync, so
 * callers still read it in their own `onClick` to capture the outgoing
 * rect.
 *
 * On the entrance that follows a real click (an origin was stashed): hands
 * focus over, since the button the interaction landed on just vanished from
 * under it, and inverts the transform to the stashed rect before releasing
 * it under a transition — translate and scale animate the button from the
 * counterpart's old screen position/size to this one's. Returns a React 19
 * ref-cleanup function so a fast double-toggle tears down an in-flight
 * animation cleanly instead of leaking its frame/timer.
 */
export function useFabMorphRef<T extends HTMLElement>(target: RefObject<T | null>): RefCallback<T> {
  return useCallback((el: T | null) => {
    target.current = el;
    if (!el) return undefined;

    const from = originRect;
    originRect = null;
    if (!from) return undefined;

    el.focus({ preventScroll: true });

    const ms = motionMs();
    const to = el.getBoundingClientRect();
    if (ms === 0 || to.width === 0 || to.height === 0) return undefined;

    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const sx = from.width / to.width;
    const sy = from.height / to.height;

    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    // Forces the browser to commit the inverted frame before the transition
    // below is allowed to animate away from it — otherwise both style writes
    // land in the same paint and there is nothing to see move.
    el.getBoundingClientRect();

    const raf = requestAnimationFrame(() => {
      el.style.transition = `transform ${ms}ms ease-in-out`;
      el.style.transform = '';
    });

    let done = false;
    const clear = () => {
      if (done) return;
      done = true;
      el.style.transition = '';
      el.style.transform = '';
    };
    // `transitionend` for the normal case; the timeout is what fires if the
    // transition is interrupted or never starts.
    const timer = setTimeout(clear, ms + 50);
    el.addEventListener('transitionend', clear, { once: true });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      el.removeEventListener('transitionend', clear);
    };
  }, [target]);
}
