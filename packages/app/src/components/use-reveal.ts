import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * How long a panel takes to slide open or shut, in ms.
 *
 * The one source of the duration: every reveal-related transition reads
 * {@link motionMs}, which returns this unless reduced motion is on. Nothing
 * pairs it with a Tailwind `duration-*` class by hand any more — `style` is
 * always where the number lives.
 */
export const REVEAL_MS = 200;

/**
 * A frame gap long enough to mean the main thread was busy, in ms.
 *
 * Two frames at 60Hz. A 120Hz display reports ~8ms and a healthy 60Hz one
 * ~16ms, so anything past this is not the display's pace — it is work.
 */
const STALLED_FRAME_MS = 32;

/** How many frames an entrance will wait for a quiet one before giving up. */
const MAX_WAIT_FRAMES = 8;

/**
 * Slack added to `motionMs()` for the settle race.
 *
 * `useRevealSize` spends a frame or two at the starting size before the CSS
 * transition actually begins, so racing a timer against `transitionend` at
 * exactly the duration would sometimes fire the timer first and snap the last
 * few pixels instead of letting the transition finish on its own.
 */
const SETTLE_SLACK_MS = 50;

/**
 * Whether reveal transitions should run at all.
 *
 * `data-motion="reduced"` is written on `<html>` by `@bilo-io/shell`'s
 * `applyMotion`, never by this repo — read fresh on every call rather than
 * subscribed to, because a preference change re-renders `App` anyway.
 */
export const motionMs = (): number =>
  document.documentElement.dataset['motion'] === 'reduced' ? 0 : REVEAL_MS;

export type Reveal = {
  /** Render the panel at all? Stays true for the length of the exit. */
  mounted: boolean;
  /** Render it at full size? False for the first frame of an entrance. */
  shown: boolean;
};

/**
 * Wait for the first animation frame that is not stalled, and never the frame
 * this was called on.
 *
 * Two things are being dodged. A `requestAnimationFrame` callback runs BEFORE
 * the paint it belongs to, so a single frame's callback can land in the same
 * paint as a mount — the browser then only ever sees the final size and skips
 * the transition entirely. And a panel with real work to do on arrival (the
 * terminal builds an xterm and a WebGL context) blocks the main thread for
 * longer than the animation lasts, so a transition started into that stall
 * runs to completion with no frames to show it in: the panel simply appears.
 * Waiting for two frames close enough together to mean the thread is free
 * again is what buys the animation frames to play in — and the frame cap is
 * there so a machine that is uniformly slow still gets its panel, just
 * without the flourish.
 */
function onQuietFrame(done: () => void): () => void {
  let handle = 0;
  let last = 0;
  let waited = 0;
  const step = (now: number) => {
    waited += 1;
    const quiet = last !== 0 && now - last < STALLED_FRAME_MS;
    last = now;
    if (quiet || waited >= MAX_WAIT_FRAMES) {
      done();
      return;
    }
    handle = requestAnimationFrame(step);
  };
  handle = requestAnimationFrame(step);
  return () => cancelAnimationFrame(handle);
}

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
 *
 * Kept for the browser pane, which tweens opacity rather than a size —
 * `useRevealSize` below is what every size-tweened panel uses instead.
 */
export function useReveal(open: boolean, ms: number = REVEAL_MS): Reveal {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return onQuietFrame(() => setShown(true));
    }

    setShown(false);
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open, ms]);

  return { mounted, shown };
}

export type RevealSize<T extends HTMLElement = HTMLElement> = {
  /** Attach to the element whose `width`/`height` this drives — for `transitionend`. */
  ref: RefObject<T | null>;
  mounted: boolean;
  shown: boolean;
  /** False for the length of an open/close toggle or a target-size change; true at rest. */
  settled: boolean;
  /** Increments once per tween that finishes — a plain prop, so it survives a mount effect closure. */
  settleCount: number;
  style: CSSProperties;
};

/**
 * Tween a panel's width or height between 0 and a target size.
 *
 * The one primitive every size-tweened panel in the app shares — the
 * terminal, its session list, and the repositories sidebar — so they cannot
 * drift on duration, easing or the reduced-motion rule. The browser pane is
 * NOT one of these: it tweens opacity, not a size, and keeps `useReveal`.
 *
 * Generic over the element type only so the returned `ref` matches whatever
 * the caller attaches it to (`<aside>` vs `<div>`) without a cast at the call
 * site — `T` carries no other behaviour.
 */
export function useRevealSize<T extends HTMLElement = HTMLElement>({
  open,
  size,
  axis,
  dragging = false,
  animateKey,
}: {
  open: boolean;
  size: number;
  axis: 'x' | 'y';
  dragging?: boolean;
  /**
   * What "the target changed" means, for callers where `size` itself can
   * drift for reasons that must NOT animate.
   *
   * Defaults to `` `${open}:${size}` `` — every genuine size change (a drag
   * release, restore ↔ maximize) arms the tween. The terminal's maximized
   * height is the one caller that cannot use this default: `terminalTarget`
   * tracks the window's own live size while maximized, and keying on it
   * would re-arm the transition on every resize tick for as long as the
   * window keeps moving — the terminal's bottom edge visibly trailing the
   * window edge by `motionMs()`, which is the exact regression the
   * `useSettled` this replaced was built to avoid. That caller passes
   * `` `${open}:${maximized}` `` instead, so only the discrete open/maximize
   * TOGGLE arms the tween and a live window resize never does.
   */
  animateKey?: string;
}): RevealSize<T> {
  const ref = useRef<T | null>(null);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const [settled, setSettled] = useState(true);
  const [settleCount, setSettleCount] = useState(0);

  /*
    What the panel is currently aiming at. While dragging the target is
    frozen — a drag frame is not a transition, it IS the frame, and `style`
    below sets `transitionProperty: 'none'` for exactly that reason. The
    moment dragging ends this becomes non-null again and compares against
    whatever it was before the drag started, which is what makes a drag
    release animate to the value it actually settled on.
  */
  const target = dragging ? null : (animateKey ?? `${open}:${size}`);
  const previousTarget = useRef(target);
  if (dragging) {
    // No transition runs while dragging, so the shortcut applies immediately.
    if (!settled) setSettled(true);
  } else if (target !== previousTarget.current) {
    previousTarget.current = target;
    setSettled(false);
  }

  // Entrance/exit, same shape as `useReveal` — `shown` flips true only once a
  // quiet frame proves the thread isn't mid-stall.
  useEffect(() => {
    if (open) {
      setMounted(true);
      return onQuietFrame(() => setShown(true));
    }
    setShown(false);
    // No timer here: `mounted` comes down once the closing tween's own
    // settle race (below) finishes, not on a second, independent clock.
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open && settled) setMounted(false);
  }, [open, settled]);

  /*
    The settle race: `transitionend` on the caller's element, or a timeout,
    whichever fires first. The timeout is what fires under reduced motion,
    where no transition runs at all.

    `mounted` is in the dependency list for a timing reason, not a logical
    one: the render that first flips `open` true also unsettles `settled` in
    the SAME commit (the "adjust state during render" pattern above), but
    `mounted` itself only becomes true via its OWN effect one commit later —
    so on a panel's first reveal from fully closed, this effect's first run
    finds `ref.current` still null (the element does not exist yet) and falls
    through to the timeout alone. Re-running once `mounted` catches up lets it
    attach to the now-real element while still unsettled, so the genuine
    `transitionend` race applies to the case it matters most for.
  */
  useEffect(() => {
    if (settled) return undefined;
    const el = ref.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setSettled(true);
      setSettleCount((count) => count + 1);
    };
    const timer = setTimeout(finish, motionMs() + SETTLE_SLACK_MS);
    el?.addEventListener('transitionend', finish);
    return () => {
      clearTimeout(timer);
      el?.removeEventListener('transitionend', finish);
    };
  }, [settled, mounted]);

  const dimension = axis === 'x' ? 'width' : 'height';
  const style: CSSProperties = {
    [dimension]: shown ? size : 0,
    /*
      Armed only while genuinely mid-toggle — matching the conditional
      `transition-[height]` CLASS the removed code applied only when
      unsettled, rather than a permanent `transition-property` that would
      animate every subsequent value change regardless of what caused it
      (a native window resize while maximized, in particular).
    */
    transitionProperty: dragging || settled ? 'none' : dimension,
    transitionDuration: `${motionMs()}ms`,
    transitionTimingFunction: 'ease-in-out',
  };

  return { ref, mounted, shown, settled, settleCount, style };
}
