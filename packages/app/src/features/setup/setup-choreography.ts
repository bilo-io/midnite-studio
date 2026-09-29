/**
 * The setup overlay's motion (Phase 98 Themes B and C), as data.
 *
 * Every animated sequence here is a **timeline**: a list of frames, each with
 * the time it applies at. Builders are pure and take `reduced` themselves, so
 * the reduced-motion short-circuit is a property of the timeline (one frame,
 * at 0, already in its final state) rather than a branch buried in a
 * component. `playTimeline` then drives any of them with `setTimeout`, and
 * only for as long as frames remain: nothing here schedules an animation
 * frame, and nothing keeps running once the last frame has applied. What moves
 * on screen is CSS (keyframes and transitions in `styles.css`) or one Web
 * Animations call (`flipKeyframes`), never a script loop.
 */

/** Every duration the choreography uses, in ms. One table, so a retune is one edit. */
export const CHOREO = {
  /** Before the first letter of "Midnite": the caret blinks alone beside the mark. */
  introLeadMs: 420,
  /** Per letter of "Midnite". Slower than a page title: seven letters, set large. */
  introCharMs: 110,
  /** After the last letter, before the blurb and Begin appear. */
  introSettleMs: 260,
  /** The wordmark fading out before the mark leaves for the anchor. */
  wordFadeMs: 220,
  /** The mark's glide (translate + scale) into the title anchor. */
  glideMs: 560,
  /** Theme C: the page content fading out as the handoff starts. */
  handoffFadeMs: 240,
  /** Theme C: how long the hint and arrow hold before the overlay dissolves by itself. */
  handoffBeatMs: 2600,
  /** Theme C: the overlay dissolving to the app. */
  dissolveMs: 320,
} as const;

/** The glide's curve: fast out of the centre, settling softly into the anchor. */
export const GLIDE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Whether the overlay's motion should resolve instantly — see `lib/reduced-motion.ts`. */
export { isReducedMotion } from '../../lib/reduced-motion';

/** One step of a timeline: the frame's payload, applied at `at` ms from the start. */
export type Timed<F> = { at: number; frame: F };

/**
 * Apply every frame of `timeline` in order, each at its own time. Frames at
 * or before 0 apply synchronously, before this returns — which is what lets
 * a reduced-motion timeline (one frame at 0) land in the same render as the
 * mount, with no timer at all. Returns a cancel that drops whatever has not
 * applied yet.
 */
export function playTimeline<F>(timeline: readonly Timed<F>[], apply: (frame: F) => void): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const { at, frame } of timeline) {
    if (at <= 0) apply(frame);
    else timers.push(setTimeout(() => apply(frame), at));
  }
  return () => {
    for (const timer of timers) clearTimeout(timer);
  };
}

// --- Theme B: the intro ------------------------------------------------------

/**
 * Where the intro is: `typing` while the word appears letter by letter beside
 * the mark, `ready` once it is whole and the blurb and Begin may show.
 */
export type IntroPhase = 'typing' | 'ready';
export type IntroFrame = { typed: string; phase: IntroPhase };

/**
 * The intro: an empty word with the caret blinking beside the mark, then one
 * letter every `introCharMs`, then `ready` a beat after the last. Reduced
 * motion is one frame at 0 with the whole word, already `ready`.
 */
export function introTimeline(word: string, reduced: boolean): Timed<IntroFrame>[] {
  if (reduced || word.length === 0) return [{ at: 0, frame: { typed: word, phase: 'ready' } }];
  const frames: Timed<IntroFrame>[] = [{ at: 0, frame: { typed: '', phase: 'typing' } }];
  for (let i = 1; i <= word.length; i += 1) {
    frames.push({
      at: CHOREO.introLeadMs + (i - 1) * CHOREO.introCharMs,
      frame: { typed: word.slice(0, i), phase: 'typing' },
    });
  }
  const last = frames[frames.length - 1]!.at;
  frames.push({ at: last + CHOREO.introSettleMs, frame: { typed: word, phase: 'ready' } });
  return frames;
}

// --- Theme B: the mark's glide into the anchor --------------------------------

/** The part of a `DOMRect` a FLIP needs — so a test can pass plain numbers. */
export type RectLike = { left: number; top: number; width: number; height: number };

/**
 * FLIP's "invert": the transform that puts an element sitting at `last` back
 * over `first`, pinned to its top-left corner so translate and scale compose
 * without the scale dragging the corner off target. Played from this to
 * `none`, the element appears to travel from `first` to where it really is.
 */
export function flipKeyframes(first: RectLike, last: RectLike): Keyframe[] {
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const scale = last.width > 0 ? first.width / last.width : 1;
  return [
    { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    { transformOrigin: 'top left', transform: 'none' },
  ];
}

/**
 * A square of `size` centred in `container` — where the mark starts when the
 * overlay opens straight onto a page (a resume), so it still arrives from the
 * middle of the window the way it does after the intro, just without typing
 * "Midnite" first.
 */
export function centredRect(container: RectLike, size: number): RectLike {
  return {
    left: container.left + (container.width - size) / 2,
    top: container.top + (container.height - size) / 2,
    width: size,
    height: size,
  };
}

/**
 * Play the glide on `el` with the Web Animations API, if it has one (jsdom
 * does not, and a missing API means no flourish rather than an error). The
 * element is already at its final place in layout — this only animates a
 * transform over it — so however the animation ends, it ends right.
 */
export function playGlide(el: HTMLElement, first: RectLike): void {
  if (typeof el.animate !== 'function') return;
  const last = el.getBoundingClientRect();
  if (last.width === 0) return;
  el.animate(flipKeyframes(first, last), { duration: CHOREO.glideMs, easing: GLIDE_EASING });
}

// --- Theme C: the handoff to the FAB ------------------------------------------

/**
 * Where the Skip / X handoff is. `fading`: the page content goes. `pointing`:
 * the hint, the FAB and the arrow hold. `dissolving`: the whole overlay fades
 * to the app. `done`: close it.
 */
export type HandoffPhase = 'fading' | 'pointing' | 'dissolving' | 'done';

/**
 * The handoff. Reduced motion drops both fades but keeps the beat: the hint is
 * something to read, not an animation, and cutting it would leave nothing to
 * say where setup went.
 */
export function handoffTimeline(reduced: boolean): Timed<HandoffPhase>[] {
  if (reduced) {
    return [
      { at: 0, frame: 'pointing' },
      { at: CHOREO.handoffBeatMs, frame: 'done' },
    ];
  }
  const pointAt = CHOREO.handoffFadeMs;
  const dissolveAt = pointAt + CHOREO.handoffBeatMs;
  return [
    { at: 0, frame: 'fading' },
    { at: pointAt, frame: 'pointing' },
    { at: dissolveAt, frame: 'dissolving' },
    { at: dissolveAt + CHOREO.dissolveMs, frame: 'done' },
  ];
}

/**
 * Cutting the beat short — a click anywhere, or Escape. Reduced motion closes
 * at once; otherwise it is the tail of the full timeline, a dissolve and done.
 */
export function dissolveTimeline(reduced: boolean): Timed<HandoffPhase>[] {
  if (reduced) return [{ at: 0, frame: 'done' }];
  return [
    { at: 0, frame: 'dissolving' },
    { at: CHOREO.dissolveMs, frame: 'done' },
  ];
}
