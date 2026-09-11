import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { useResolvedMotion } from '../store/appearance-store';
import { CASCADE_MAX_STEPS, CASCADE_STEP_MS, cascadeStyle } from './cascade';

export type CascadeReveal = {
  /** True for the length of the cascade — apply the entrance classes only then. */
  active: boolean;
  /** Per-item style for the cascade; `{}` once `active` is false or under reduced motion. */
  styleFor: (index: number) => CSSProperties;
};

/**
 * The one reveal gate every cascading surface shares — Phase 84 Theme K.
 *
 * Before this hook, the graph rolled its own (`isCascading`/`prevRequestId` in
 * `graph-view.tsx`), keyed on the graph store's `requestId` — which changes on
 * *every* watcher-driven re-stream, so the graph re-cascaded on every save.
 * Every other list either had no gate at all (the repos panel) or applied its
 * per-row `cascadeStyle` unconditionally and relied on React's own key-based
 * remounting to happen to produce the right effect, which is fragile: it only
 * "works" for as long as nothing changes how those rows are keyed.
 *
 * `revealKey` is the caller's own answer to "what counts as a reveal" — for
 * the graph it is `` `${selectedRepoId}:${revealCount}` ``, bumped on mount,
 * on becoming visible again after being hidden, and on a repo switch, but
 * *never* on the request id a data refresh changes. A list that fully
 * unmounts on view switch (Actions, Issues, Reviews, the repos panel) can
 * pass something as simple as the repo id: the component's own mount/unmount
 * already gives "first mount" and "reveal after hidden" for free, and the key
 * only needs to also change across a repo switch that happens without an
 * unmount in between.
 *
 * Arms immediately (so a fresh mount's first paint already has `active: true`
 * rather than flashing the settled frame for one tick — the same
 * adjust-during-render trick `useRevealSize`'s settle race and the graph's
 * former `isCascading`/`prevRequestId` both used) and self-clears after
 * `(steps + 1) * stepMs + 250ms`, long enough for the slowest staggered item
 * plus its own fade to finish. Under `useResolvedMotion() === 'reduced'` it
 * never arms at all: `active` stays false and `styleFor` always returns `{}`,
 * so a reduced-motion frame is byte-identical to the settled one from the
 * first paint — there is no animation to skip, only one that never starts.
 */
export function useCascadeReveal({
  revealKey,
  steps = CASCADE_MAX_STEPS,
  stepMs = CASCADE_STEP_MS,
}: {
  revealKey: string | number;
  steps?: number;
  stepMs?: number;
}): CascadeReveal {
  const reduced = useResolvedMotion() === 'reduced';
  const [active, setActive] = useState(!reduced);
  const prevKey = useRef(revealKey);

  if (prevKey.current !== revealKey) {
    prevKey.current = revealKey;
    if (!reduced) setActive(true);
  }

  useEffect(() => {
    if (reduced) {
      setActive(false);
      return undefined;
    }
  }, [reduced]);

  useEffect(() => {
    if (reduced || !active) return undefined;
    const duration = (steps + 1) * stepMs + 250;
    const timer = setTimeout(() => setActive(false), duration);
    return () => clearTimeout(timer);
    // `revealKey` is the re-arm trigger: every distinct reveal gets its own
    // fresh settle window, even if `active` never left `true` in between (a
    // reveal that lands mid-cascade still resets the clock rather than
    // cutting the new one short at whatever time was left on the old one).
  }, [revealKey, reduced, active, steps, stepMs]);

  return {
    active: active && !reduced,
    styleFor: (index: number) => (active && !reduced ? cascadeStyle(index, steps) : {}),
  };
}

/**
 * How many times `visible` has transitioned from `false` to `true` —
 * `useCascadeReveal`'s "reveal after hidden" building block, and nothing
 * else. It does not bump on a repo switch (fold `repoId` into the caller's
 * own `revealKey` for that), on a data refresh, or on a watcher-driven
 * restream — a kept-alive Graph re-streaming while it happens to be visible,
 * or while hidden, changes neither `visible` nor this count, which is the
 * whole guarantee Theme K.8 tests.
 *
 * Starts at 0 and never bumps on the render that first calls it, whatever
 * `visible` reads then: a fresh mount already gets its own reveal for free
 * from `useCascadeReveal`'s own arm-on-first-call behaviour, so counting the
 * initial value here too would double it.
 */
export function useRevealCount(visible: boolean): number {
  const count = useRef(0);
  const wasVisible = useRef(visible);
  if (visible && !wasVisible.current) count.current += 1;
  wasVisible.current = visible;
  return count.current;
}
