import { useEffect, useState } from 'react';

import { useReducedMotion } from '../hooks/use-reduced-motion';

/*
  The site's one typing treatment, and everything needed to reuse it.

  It began as the hero's private component. It moved here when the agent
  marquee's name caption needed the *same* caret and the *same* cadence — a
  second, slightly-different typewriter on one page is the sort of thing nobody
  notices individually and everybody notices together.

  The two callers want different clocks, though, and that is why this file
  exports three things rather than one:

  - `Typewriter` — the hero's component, which owns its own timer and rotates
    through a phrase list forever.
  - `TypewriterCaret` — the caret, so the caption's is the hero's caret and not
    a copy of it.
  - `typedLength` — a **pure** function from "how far into a type → hold →
    delete pass are we" to "how many characters are showing". No clock, no
    state, no effect. The marquee hands it elapsed milliseconds from the
    timeline that already drives the band, which is what lets the caption stay
    in step with the logo it names without a second clock to drift against.

  The cadence constants are exported for the same reason: the caption's typing
  has to be the hero's typing, and the way to guarantee that is for there to be
  one copy of each number.
*/

/** ms per character while typing. */
export const TYPE_MS = 62;
/** ms per character while deleting — faster, because nobody reads a rewind. */
export const DELETE_MS = 28;
/** ms to hold a finished phrase before deleting it. */
export const HOLD_MS = 1500;
/** ms to pause on the empty string before the next phrase starts. */
export const GAP_MS = 320;

export type TypedPassOptions = {
  /** How long the whole pass lasts. Deleting is timed to finish exactly here. */
  windowMs: number;
  /** ms per character typed. Defaults to the site's `TYPE_MS`. */
  typeMs?: number;
  /** ms per character deleted. Defaults to the site's `DELETE_MS`. */
  deleteMs?: number;
};

/**
 * How many characters of `text` are showing `elapsed` ms into one pass.
 *
 * The pass is "type it, hold it, cut it", laid out inside a fixed window:
 *
 *   0 … n·typeMs                    typing, one character per `typeMs`
 *   n·typeMs … windowMs − n·deleteMs  held, whatever is left over
 *   … windowMs                      deleting, one character per `deleteMs`
 *
 * **The hold is the term that stretches, and that is deliberate.** The window
 * is the marquee's own period, so when that period changes the typing keeps the
 * site's cadence and the *hold* absorbs the difference — the caption never
 * races to fit, and never finishes early and sits there blank.
 *
 * A window too short for both ramps (a very long name, a very fast cycle) is
 * handled by giving typing the first 60% and deleting the last 25%, scaled
 * down to fit. Nothing on the roster comes near it; the branch exists so the
 * function is total rather than as a case anyone should plan around.
 */
export const typedLength = (
  text: string,
  elapsed: number,
  { windowMs, typeMs = TYPE_MS, deleteMs = DELETE_MS }: TypedPassOptions,
): number => {
  const n = text.length;
  if (n === 0 || windowMs <= 0) return 0;

  let typeStep = typeMs;
  let deleteStep = deleteMs;
  if (n * typeMs + n * deleteMs > windowMs) {
    typeStep = (windowMs * 0.6) / n;
    deleteStep = (windowMs * 0.25) / n;
  }

  const typedFor = n * typeStep;
  const deleteAt = windowMs - n * deleteStep;
  const t = Math.max(elapsed, 0);

  if (t < typedFor) return Math.min(n, Math.floor(t / typeStep));
  if (t < deleteAt) return n;
  return Math.max(0, n - Math.ceil((t - deleteAt) / deleteStep));
};

export type TypewriterCaretProps = {
  className?: string;
};

/**
 * The caret: a hard-blinking block, the width of a hairline.
 *
 * A shared component rather than a shared class, because the caret is a `<span>`
 * with a non-breaking space in it — the space is what gives it the line's own
 * height instead of a px value that would drift from the font size, and a class
 * alone would not carry that.
 */
export const TypewriterCaret = ({ className = '' }: TypewriterCaretProps) => (
  <span
    aria-hidden="true"
    data-testid="typewriter-caret"
    className={`ws-caret ml-0.5 inline-block w-[0.08em] -translate-y-[0.04em] self-stretch bg-accent align-baseline text-transparent ${className}`}
  >
    &nbsp;
  </span>
);

export type TypewriterProps = {
  /** The phrases, in order. The first is what reduced motion shows, statically. */
  phrases: readonly string[];
  className?: string;
};

type Mode = 'typing' | 'holding' | 'deleting';

/**
 * A headline that types through a list of phrases, with a blinking caret.
 *
 * **The longest phrase reserves the line's height and width** — an
 * `aria-hidden`, `invisible` copy of it sits in the same box. Without it the
 * layout reflows on nearly every keystroke, which moves the two CTAs
 * underneath by a few pixels a dozen times a second and makes the whole hero
 * feel unstable.
 *
 * **Accessibility is the static string, not the animation.** A screen reader
 * gets the full phrase list once, in a visually-hidden element; the animated
 * text is `aria-hidden`. Announcing a partial word on every tick would be
 * unusable, and an `aria-live` region here would be actively hostile.
 *
 * Under reduced motion the first phrase renders as plain text with no caret and
 * no timer — the hook is what makes that possible, since a media query cannot
 * cancel a `setTimeout`.
 *
 * This one keeps its own state machine rather than being driven by
 * `typedLength` above: it rotates forever through a list, so there is no window
 * to be a fraction of, and a state machine is the honest shape for "type, wait
 * for a beat you chose, delete, advance".
 */
export const Typewriter = ({ phrases, className = '' }: TypewriterProps) => {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [mode, setMode] = useState<Mode>('typing');

  const longest = phrases.reduce((a, b) => (b.length > a.length ? b : a), '');
  const current = phrases[index % Math.max(phrases.length, 1)] ?? '';

  useEffect(() => {
    if (reduced || phrases.length === 0) return;

    const delay =
      mode === 'holding'
        ? HOLD_MS
        : mode === 'deleting'
          ? length === 0
            ? GAP_MS
            : DELETE_MS
          : TYPE_MS;

    const timer = window.setTimeout(() => {
      if (mode === 'typing') {
        if (length < current.length) setLength(length + 1);
        else setMode('holding');
        return;
      }
      if (mode === 'holding') {
        // A single phrase has nothing to rotate to, so it stays up.
        if (phrases.length > 1) setMode('deleting');
        return;
      }
      if (length > 0) {
        setLength(length - 1);
        return;
      }
      setIndex((i) => (i + 1) % phrases.length);
      setMode('typing');
    }, delay);

    return () => window.clearTimeout(timer);
  }, [reduced, phrases, current, length, mode]);

  if (reduced) {
    return <span className={className}>{phrases[0] ?? ''}</span>;
  }

  return (
    <span className={`relative inline-block ${className}`}>
      {/* Reserves the box for the longest phrase — see the docblock. */}
      <span aria-hidden="true" className="invisible whitespace-pre">
        {longest}
      </span>
      <span className="absolute inset-0 whitespace-pre" aria-hidden="true">
        <span data-testid="typewriter-text">{current.slice(0, length)}</span>
        <TypewriterCaret />
      </span>
      <span className="sr-only">{phrases.join(' ')}</span>
    </span>
  );
};
