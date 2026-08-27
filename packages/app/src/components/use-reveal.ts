import { useEffect, useState } from 'react';

/**
 * How long a panel takes to slide open or shut, in ms.
 *
 * Shared by the JS and the CSS: `useReveal` holds a leaving panel mounted for
 * exactly this long, and every call site pairs it with Tailwind's
 * `duration-200`. Tailwind needs a literal class, so the two cannot be derived
 * from one another — change one and you must change the other.
 */
export const REVEAL_MS = 200;

/**
 * How long the transition CLASS stays armed after a toggle.
 *
 * The animation plus slack. `useReveal` spends a frame or two at the collapsed
 * size before it starts, so disarming at exactly `REVEAL_MS` would strip
 * `transition-*` from the element with a few pixels still to travel — which
 * snaps the last frames instead of easing them.
 */
export const REVEAL_HOLD_MS = 320;

/**
 * A frame gap long enough to mean the main thread was busy, in ms.
 *
 * Two frames at 60Hz. A 120Hz display reports ~8ms and a healthy 60Hz one
 * ~16ms, so anything past this is not the display's pace — it is work.
 */
const STALLED_FRAME_MS = 32;

/** How many frames an entrance will wait for a quiet one before giving up. */
const MAX_WAIT_FRAMES = 8;

export type Reveal = {
  /** Render the panel at all? Stays true for the length of the exit. */
  mounted: boolean;
  /** Render it at full size? False for the first frame of an entrance. */
  shown: boolean;
};

/**
 * Mount and unmount a panel with room for a transition at each end.
 *
 * `{open ? <Panel/> : null}` cannot animate in either direction: on the way in
 * the panel is already at its final size in the frame it first paints, and on
 * the way out it is gone before a transition could run. This keeps it mounted
 * through the exit and gives the entrance a painted frame at zero to travel
 * from — the caller renders `shown ? size : 0` and puts the transition on
 * whichever property that is.
 *
 * Both flags start at `open`, so a panel the persisted layout says is open is
 * simply there on launch rather than sliding in.
 */
export function useReveal(open: boolean, ms: number = REVEAL_MS): Reveal {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      /*
        Start on the first frame that is not stalled, and never on the frame the
        panel mounted in.

        Two things are being dodged. A `requestAnimationFrame` callback runs
        BEFORE the paint it belongs to, so a single frame's callback can land in
        the same paint as the mount — the browser then only ever sees the final
        size and skips the transition entirely. And a panel with real work to do
        on arrival (the terminal builds an xterm and a WebGL context) blocks the
        main thread for longer than the animation lasts, so a transition started
        into that stall runs to completion with no frames to show it in: the
        panel simply appears. Waiting for two frames close enough together to
        mean the thread is free again is what buys the animation frames to play
        in — and the frame cap is there so a machine that is uniformly slow
        still gets its panel, just without the flourish.
      */
      let handle = 0;
      let last = 0;
      let waited = 0;
      const step = (now: number) => {
        waited += 1;
        const quiet = last !== 0 && now - last < STALLED_FRAME_MS;
        last = now;
        if (quiet || waited >= MAX_WAIT_FRAMES) {
          setShown(true);
          return;
        }
        handle = requestAnimationFrame(step);
      };
      handle = requestAnimationFrame(step);
      return () => cancelAnimationFrame(handle);
    }

    setShown(false);
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open, ms]);

  return { mounted, shown };
}

/**
 * Whether `value` has held still long enough for its transition to be over.
 *
 * Two jobs, both about arming a transition only when it is wanted. A height
 * that also tracks the window (a maximized panel) must NOT ease its way to the
 * new size while the user drags the window edge, or it trails the edge by the
 * length of the animation; and a pane that is `display: none` once a panel
 * covers it has to stay in flow while the covering is still in progress, or it
 * leaves a hole where it used to be. Both read this: arm the transition while
 * unsettled, and take the shortcut once settled.
 *
 * The state update happens during render, not in the effect, which is what
 * makes it usable for the first job: the commit that carries the new size has
 * to be the same commit that carries the `transition-*` class, and an effect
 * runs a commit too late — the size would jump, then the class would arrive.
 */
export function useSettled(value: unknown, ms: number = REVEAL_HOLD_MS): boolean {
  const [previous, setPrevious] = useState(value);
  const [settled, setSettled] = useState(true);

  // React's "adjust state when the input changes" pattern: this re-renders
  // immediately, before anything is committed to the DOM.
  if (previous !== value) {
    setPrevious(value);
    setSettled(false);
  }

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(timer);
  }, [settled, value, ms]);

  return settled;
}
