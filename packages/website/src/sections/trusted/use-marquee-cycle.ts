import { useEffect, useRef, useState } from 'react';

export type UseMarqueeCycleOptions = {
  /** How many logos are in one pass of the marquee. */
  count: number;
  /**
   * How long one logo takes to travel one slot — i.e. how long each logo owns
   * the centre. This is the *same* number the CSS animation is given as
   * `count × periodMs`, which is what keeps the two in step; see the docblock.
   */
  periodMs: number;
  /** Freezes the timeline. The CSS animation must be paused at the same time. */
  paused?: boolean;
};

/** `performance.now()` where it exists, wall clock where it does not. */
const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * Which logo is at the centre of the marquee, computed rather than measured.
 *
 * **The problem this solves.** The obvious way to light up "the logo at the
 * centre" is to ask the logos where they are — a `requestAnimationFrame` loop
 * calling `getBoundingClientRect()` on every slot. That is also the most
 * expensive thing a static page can do: a layout read inside rAF forces a
 * synchronous reflow every frame, against an element the compositor is already
 * animating on its own thread, which is exactly the pattern that turns a free
 * CSS transform into a pegged main thread.
 *
 * **So nothing is measured.** The geometry is arranged so the answer is
 * arithmetic:
 *
 * - every slot is exactly `--ws-agent-slot` wide, a fixed CSS length;
 * - the track is positioned so **slot 0's centre sits on the viewport's centre
 *   at `translateX(0)`** (`left: 50%` plus a half-slot pull, in `site.css`);
 * - the CSS animation moves the track left by exactly `count` slots over
 *   `count × periodMs`, linearly, forever.
 *
 * Those three together mean slot `k` is dead centre at `t = k × periodMs`, and
 * the logo at the centre at time `t` is `floor(t / periodMs) mod count`. No
 * element is consulted; the hook only needs a clock.
 *
 * **Why the half-period lead.** The brief is that a logo spins up and grows *as
 * it approaches* the centre, holds there, then spins back down *as it leaves* —
 * so its animation has to be already running when it arrives. The animation is
 * one period long with its hold in the middle, so selection fires half a period
 * early: at `t = k × periodMs − periodMs/2`. That is the `+ periodMs / 2` in the
 * step below, and it is why the returned index leads the geometric centre.
 *
 * **Drift.** Both halves are driven by the same wall clock — the CSS animation
 * by the compositor's timeline, this by `performance.now()` — and each tick is
 * scheduled from a fixed anchor rather than chained off the last one, so a
 * delayed timer corrects itself on the next tick instead of accumulating. The
 * one place error can build up is pausing: the compositor stops the animation on
 * its next frame and this stops on the same event handler, so each
 * pause/resume can cost up to a frame of skew. At a period measured in seconds
 * that is invisible, and it does not compound the way a chained timer would.
 *
 * **Cost.** One `setTimeout` per logo per pass — at ten logos and 1.6s each,
 * about 0.6 timers a second, versus 60 layout-forcing frames.
 */
export const useMarqueeCycle = ({
  count,
  periodMs,
  paused = false,
}: UseMarqueeCycleOptions): number => {
  const [selected, setSelected] = useState(0);

  /** Un-paused milliseconds already spent, folded in each time we pause. */
  const elapsedRef = useRef(0);
  /** When the currently-running span began, or `null` while paused. */
  const anchorRef = useRef<number | null>(null);

  useEffect(() => {
    if (count <= 0 || periodMs <= 0) return;

    if (paused) {
      /*
        Fold the running span into the total and stop. The previous run's
        cleanup has already cleared the timer, and `anchorRef` still holds that
        run's anchor — which is the whole reason the accumulator lives in a ref
        rather than in state.
      */
      if (anchorRef.current !== null) {
        elapsedRef.current += now() - anchorRef.current;
        anchorRef.current = null;
      }
      return;
    }

    anchorRef.current = now();
    let timer = 0;

    const tick = () => {
      const anchor = anchorRef.current ?? now();
      const elapsed = elapsedRef.current + (now() - anchor);
      /*
        The half-period lead — see the docblock. `step` counts animations
        started, so it is one ahead of "logos that have crossed the centre".
      */
      const step = Math.floor((elapsed + periodMs / 2) / periodMs);
      setSelected(((step % count) + count) % count);

      /*
        Scheduled against the anchor, not against "now + period": a tick that
        arrives late shortens the next delay instead of pushing every
        subsequent one back. The floor keeps a badly-overdue timer from asking
        for a zero-delay loop.
      */
      const nextAt = (step + 1) * periodMs - periodMs / 2;
      timer = window.setTimeout(tick, Math.max(nextAt - elapsed, 16));
    };

    tick();
    return () => window.clearTimeout(timer);
  }, [count, periodMs, paused]);

  return selected;
};
