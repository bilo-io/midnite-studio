import { useEffect, useRef, useState } from 'react';

import { nextTypedChangeAt, typedLength } from '../../components';

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
  /**
   * The logos' captions, in roster order.
   *
   * Supplying them is what makes `typed` below meaningful: the hook types the
   * selected logo's caption across that logo's own period, so the caption
   * cannot be showing one agent's name while another is at the centre. Omit it
   * and the hook is exactly the selector it was before, with no per-character
   * ticks at all.
   */
  captions?: readonly string[];
};

export type MarqueeCycle = {
  /** Which logo is running the centre cycle. */
  selected: number;
  /**
   * How many characters of `captions[selected]` are showing — 0 when no
   * captions were supplied.
   */
  typed: number;
};

/** `performance.now()` where it exists, wall clock where it does not. */
const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * Which logo is at the centre of the marquee, and how much of its name is
 * typed — computed rather than measured, off one clock rather than two.
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
 * **The caption is the same clock, not a second one.** The name under the band
 * types out, holds and cuts across the selected logo's own period, and `typed`
 * is a pure function of the *same* `elapsed` the selection is — see
 * `typedLength`. A `<Typewriter>` of its own would have been a second timeline
 * with its own drift, its own pause state and its own idea of when a phrase
 * ends, and the failure mode is the ugly one: the caption still spelling the
 * previous agent while a new logo holds the centre. Here that is not a bug that
 * can be introduced, because there is nothing to disagree with.
 *
 * The extra ticks the caption costs are per *character*, scheduled from
 * `nextTypedChangeAt`, so the hold between typing and deleting is one timer and
 * not a sampling loop.
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
 * **Cost.** Without captions, one `setTimeout` per logo per pass. With them, one
 * more per character of the name being typed or deleted — about twenty over a
 * period measured in seconds, versus 60 layout-forcing frames a second.
 */
export const useMarqueeCycle = ({
  count,
  periodMs,
  paused = false,
  captions,
}: UseMarqueeCycleOptions): MarqueeCycle => {
  const [cycle, setCycle] = useState<MarqueeCycle>({ selected: 0, typed: 0 });

  /** Un-paused milliseconds already spent, folded in each time we pause. */
  const elapsedRef = useRef(0);
  /** When the currently-running span began, or `null` while paused. */
  const anchorRef = useRef<number | null>(null);

  /*
    The captions are read through a ref so a fresh array literal from the
    caller's render does not restart the timeline. The roster is a module
    constant in practice, but a marquee that resets its clock whenever its
    parent re-renders is a bug waiting for the first stateful ancestor.
  */
  const captionsRef = useRef(captions);
  captionsRef.current = captions;

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
      const selected = ((step % count) + count) % count;

      /*
        Where we are inside *this* logo's pass. The pass starts when the logo is
        picked — the same instant its CSS animation is attached — so the name is
        fully typed by the time the logo reaches the centre and has emptied
        again before the next one takes over.

        Clamped at zero because of the half-period lead: selection 0's boundary
        is at `−period/2`, before the timeline exists. Without the clamp the
        first caption would render already half-held, and the very first thing a
        visitor sees would be a name appearing rather than being typed.
      */
      const passStart = Math.max(step * periodMs - periodMs / 2, 0);
      const phase = elapsed - passStart;
      const caption = captionsRef.current?.[selected] ?? '';
      const pass = { windowMs: periodMs };
      const typed = caption ? typedLength(caption, phase, pass) : 0;

      setCycle((previous) =>
        previous.selected === selected && previous.typed === typed
          ? previous
          : { selected, typed },
      );

      /*
        Scheduled against the anchor, not against "now + period": a tick that
        arrives late shortens the next delay instead of pushing every
        subsequent one back. The floor keeps a badly-overdue timer from asking
        for a zero-delay loop.
      */
      const selectionAt = (step + 1) * periodMs - periodMs / 2;
      const captionAt = caption ? nextTypedChangeAt(caption, phase, pass) : null;
      const nextAt =
        captionAt === null ? selectionAt : Math.min(selectionAt, captionAt + passStart);

      timer = window.setTimeout(tick, Math.max(nextAt - elapsed, 16));
    };

    tick();
    return () => window.clearTimeout(timer);
  }, [count, periodMs, paused]);

  return cycle;
};
