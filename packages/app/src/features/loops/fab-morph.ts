import { useLayoutEffect, type RefObject } from 'react';

import { motionMs } from '../../components/use-reveal';

/**
 * FLIP transform between the large FAB and the statusbar's mini version of
 * it — whichever one a click just closed stashes its rect here, and the one
 * that mounts in its place reads it back to animate in from there instead of
 * just appearing. A single module-level slot is enough: only one of the two
 * buttons is ever mounted at a time, and the stash-then-mount happens inside
 * one synchronous click handler, so there is never a second writer to race.
 *
 * A toggle with no button behind it (the `fab.toggle` command, a
 * waiting-loop notification opening a tab) leaves this `null`, and the
 * button that mounts just appears at rest — there is no on-screen origin to
 * move from.
 */
let originRect: DOMRect | null = null;

export function captureFabMorphOrigin(el: HTMLElement | null): void {
  originRect = el?.getBoundingClientRect() ?? null;
}

/**
 * On mount, invert this element's transform to match the stashed origin
 * rect, then release it under a transition — translate and scale animate it
 * from the other button's old screen position/size to this one's, the
 * classic FLIP dance. No-ops (and clears the stash) when there is nothing to
 * animate from, or under reduced motion.
 */
export function useFabMorphEntrance(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    const from = originRect;
    originRect = null;
    const ms = motionMs();
    if (!el || !from || ms === 0) return undefined;

    const to = el.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) return undefined;
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
    // element unmounts or the transition is interrupted mid-flight.
    const timer = setTimeout(clear, ms + 50);
    el.addEventListener('transitionend', clear, { once: true });

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      el.removeEventListener('transitionend', clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
