import { useEffect, useState } from 'react';

import { useInView } from '../hooks/use-in-view';
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

  A fourth export, `TypeIn`, is a different treatment for a different job: a
  heading or a paragraph that types itself in **once**, the first time it
  scrolls into view, rather than a headline that rotates forever from the
  moment it mounts. `Heading` and `Lede` (`text.tsx`) render one wherever a
  section opts in with `typeIn`; `hero.tsx` and `footer.tsx` use it directly for
  the one paragraph each that is not already wrapped in `Lede`.
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
  /** How long the whole pass lasts, gap included. */
  windowMs: number;
  /** ms per character typed. Defaults to the site's `TYPE_MS`. */
  typeMs?: number;
  /** ms per character deleted. Defaults to the site's `DELETE_MS`. */
  deleteMs?: number;
  /**
   * ms of empty line at the end of the pass, before whatever comes next.
   * Defaults to the site's `GAP_MS` — the beat the hero already leaves between
   * two phrases.
   */
  gapMs?: number;
};

/**
 * How many characters of `text` are showing `elapsed` ms into one pass.
 *
 * The pass is "type it, hold it, cut it", laid out inside a fixed window:
 *
 *   0 … n·typeMs        typing, one character per `typeMs`
 *   … windowMs − gap − n·deleteMs   held, whatever is left over
 *   … windowMs − gap    deleting, one character per `deleteMs`
 *   … windowMs          empty — the beat before whatever comes next
 *
 * **The hold is the term that stretches, and that is deliberate.** The window
 * is the marquee's own period, so when that period changes the typing keeps the
 * site's cadence and the *hold* absorbs the difference — the caption never
 * races to fit, and never finishes early and sits there blank.
 *
 * **It ends empty, and that beat is load-bearing.** The last `gapMs` of the
 * window shows nothing at all, so a caption tied to a cycle hands over on a
 * blank line rather than swapping one name for another mid-word. It is the same
 * `GAP_MS` the hero pauses for between two phrases.
 *
 * A window too short for the ramps (a very long name, a very fast cycle) is
 * handled by giving typing 55% of it, deleting 25% and the gap 10%. Nothing on
 * the roster comes near it; the branch exists so the function is total rather
 * than as a case anyone should plan around.
 */
export const typedLength = (
  text: string,
  elapsed: number,
  options: TypedPassOptions,
): number => {
  const pass = passShape(text, options);
  if (!pass) return 0;

  const { n, typeStep, typedFor, deleteAt, deleteStep } = pass;
  const t = Math.max(elapsed, 0);

  if (t < typedFor) return Math.min(n, Math.floor(t / typeStep));
  if (t < deleteAt) return n;
  return Math.max(0, n - Math.ceil((t - deleteAt) / deleteStep));
};

/**
 * The next `elapsed` at which `typedLength` would answer differently, or `null`
 * once the pass has emptied.
 *
 * This is what lets a caller that owns a clock schedule *exactly* the ticks the
 * caption needs — one per character while a ramp is running, and a single one
 * across the whole hold — rather than sampling on a grid and re-rendering
 * through a second of held text for nothing.
 */
export const nextTypedChangeAt = (
  text: string,
  elapsed: number,
  options: TypedPassOptions,
): number | null => {
  const pass = passShape(text, options);
  if (!pass) return null;

  const { typeStep, typedFor, deleteAt, deleteStep, emptyAt } = pass;
  const t = Math.max(elapsed, 0);

  if (t < typedFor) return (Math.floor(t / typeStep) + 1) * typeStep;
  if (t < deleteAt) return deleteAt;
  if (t < emptyAt) return deleteAt + (Math.floor((t - deleteAt) / deleteStep) + 1) * deleteStep;
  return null;
};

/**
 * The pass's four boundaries, or `null` when there is nothing to type.
 *
 * Both public functions above are readings of this, so the ramp lengths and the
 * short-window fallback are stated once. Otherwise "when does the caption
 * change" and "what does it show" could disagree, and the visible symptom would
 * be a caption that stops one character early.
 */
const passShape = (
  text: string,
  { windowMs, typeMs = TYPE_MS, deleteMs = DELETE_MS, gapMs = GAP_MS }: TypedPassOptions,
): {
  n: number;
  typeStep: number;
  typedFor: number;
  deleteAt: number;
  deleteStep: number;
  emptyAt: number;
} | null => {
  const n = text.length;
  if (n === 0 || windowMs <= 0) return null;

  let typeStep = typeMs;
  let deleteStep = deleteMs;
  let gap = gapMs;
  if (n * typeMs + n * deleteMs + gapMs > windowMs) {
    typeStep = (windowMs * 0.55) / n;
    deleteStep = (windowMs * 0.25) / n;
    gap = windowMs * 0.1;
  }

  const emptyAt = windowMs - gap;
  return {
    n,
    typeStep,
    typedFor: n * typeStep,
    deleteAt: emptyAt - n * deleteStep,
    deleteStep,
    emptyAt,
  };
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

/** Target ms for a heading to finish typing — short copy, so this stays snappy. */
export const TYPE_IN_HEADING_MS = 600;
/** Target ms for a paragraph to finish typing. */
export const TYPE_IN_LEDE_MS = 1400;
/**
 * The per-character delay a target implies is never faster or slower than
 * this. The floor is what keeps the site's one very long paragraph (the
 * hero's, ~350 characters) from crawling: at the target above it would want
 * under 4ms/character, and this holds it to `6`, landing the whole thing
 * around 2.1s rather than the ~1.4s everything shorter gets. The ceiling is
 * what stops a three-word heading like "What people say" from being typed at
 * a leisurely 40ms/character; nothing on the site is short enough to hit it,
 * it exists so the function is total rather than as a case anyone plans
 * around — the same posture `typedLength`'s own short-window branch takes.
 */
export const TYPE_IN_MIN_CHAR_MS = 6;
export const TYPE_IN_MAX_CHAR_MS = 55;

/**
 * The per-character delay for typing `length` characters in roughly `targetMs`.
 *
 * A flat per-character delay would make every block of copy on the site take
 * as long as its length happens to be — bearable for "What people say", not for
 * a 250-character lede at the hero's own 62ms/character. Scaling the delay by
 * length instead keeps every heading landing around `TYPE_IN_HEADING_MS` and
 * every paragraph around `TYPE_IN_LEDE_MS`, whatever their word count, clamped
 * so neither ramp leaves the range that still reads as typing rather than as a
 * flicker or a crawl.
 */
export const typeInCharMs = (length: number, targetMs: number): number => {
  if (length <= 0) return TYPE_IN_MAX_CHAR_MS;
  return Math.min(TYPE_IN_MAX_CHAR_MS, Math.max(TYPE_IN_MIN_CHAR_MS, targetMs / length));
};

export type TypeInProps = {
  /** The full string. Plain text only — this types characters, not markup. */
  text: string;
  /** How long the whole string should take, before the per-character clamp. */
  targetMs?: number;
  /**
   * ms to hold, once in view, before the first character — lets a sibling
   * heading finish typing before the paragraph under it starts. Defaults to
   * `TYPE_IN_HEADING_MS`, which is the right number whenever this `TypeIn` is
   * the lede under a heading that is typing at the default rate; pass `0` for
   * one that has no heading to wait for.
   */
  leadMs?: number;
  className?: string;
};

/**
 * A heading or a paragraph that types itself in **once**, the first time it
 * scrolls into view.
 *
 * This is a different treatment from `Typewriter` above, not a reuse of it:
 * `Typewriter` owns a headline that rotates through a phrase list forever from
 * the moment it mounts, which is right for a hero that is on screen from the
 * first frame. Most of the site is not — a visitor scrolling down should see
 * every section's title and lede type themselves in as they arrive, once, and
 * a heading that finished typing before anyone scrolled to it would be
 * indistinguishable from static text, which is the whole effect lost for
 * nothing.
 *
 * **Trigger: `useInView`, the same one-shot observer `Reveal` uses**, not a
 * second observer of its own. `inView` starts `true` when
 * `IntersectionObserver` is missing, so this degrades to "type on mount" rather
 * than "never type" in that environment — the same failure direction `Reveal`
 * takes.
 *
 * **No layout shift.** The full string is rendered twice, stacked in the same
 * grid cell (`gridArea: '1 / 1'`) rather than positioned absolutely: a
 * paragraph wraps across a variable number of lines, and only a shared grid
 * cell — sized by whichever child needs the most lines — reserves the right
 * height regardless of how many lines the *typed* copy happens to occupy at
 * any instant. The first copy is `invisible` (so it still lays out and sizes
 * the cell) and holds the full text from the first frame; the second is the
 * animated one, `aria-hidden`, showing `text.slice(0, length)` plus a caret
 * while it is still typing.
 *
 * **Accessibility is the static string, not the animation** — exactly
 * `Typewriter`'s own rule. A `sr-only` third copy carries the full text from
 * the first render, so a screen reader has the whole heading or paragraph
 * immediately rather than a word at a time; both other copies are
 * `aria-hidden` so neither is ever what gets announced.
 *
 * **`prefers-reduced-motion: reduce` renders the plain string, full length, no
 * caret, no timer** — the reduced branch below, same shape as `Typewriter`'s.
 *
 * **Pauses while the tab is hidden.** A `visibilitychange` listener, not a read
 * of `page-visibility.ts`'s `data-page-hidden` attribute: that attribute drives
 * CSS `animation-play-state` for the site's *infinite* CSS animations, and
 * `AgentMarquee`'s own JS timeline already listens to `document.hidden`
 * directly for the identical reason a backgrounded tab should not spend
 * anything — this follows that precedent rather than the CSS one, since the
 * clock here is a `setTimeout` chain, not a paused-and-resumed keyframe.
 */
export const TypeIn = ({ text, targetMs = TYPE_IN_LEDE_MS, leadMs, className = '' }: TypeInProps) => {
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [length, setLength] = useState(0);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const charMs = typeInCharMs(text.length, targetMs);
  const lead = leadMs ?? TYPE_IN_HEADING_MS;

  useEffect(() => {
    if (reduced || hidden || !inView || length >= text.length) return;
    const delay = length === 0 ? lead + charMs : charMs;
    const timer = window.setTimeout(
      () => setLength((current) => Math.min(text.length, current + 1)),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [reduced, hidden, inView, length, text, charMs, lead]);

  if (reduced) {
    return (
      <span ref={ref} className={className}>
        {text}
      </span>
    );
  }

  const done = length >= text.length;

  return (
    <span ref={ref} className={`grid w-full ${className}`}>
      {/* Reserves the cell at the full string's own line count — see the docblock. */}
      <span aria-hidden="true" className="invisible" style={{ gridArea: '1 / 1' }}>
        {text}
      </span>
      <span aria-hidden="true" style={{ gridArea: '1 / 1' }}>
        <span data-testid="type-in-text">{text.slice(0, length)}</span>
        {done ? null : <TypewriterCaret />}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
};
