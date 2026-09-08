import { useEffect, useState } from 'react';

import { useReducedMotion } from '../../hooks/use-reduced-motion';

export type TypewriterProps = {
  /** The phrases, in order. The first is what reduced motion shows, statically. */
  phrases: readonly string[];
  className?: string;
};

/** ms per character while typing. */
const TYPE_MS = 62;
/** ms per character while deleting — faster, because nobody reads a rewind. */
const DELETE_MS = 28;
/** ms to hold a finished phrase before deleting it. */
const HOLD_MS = 1500;
/** ms to pause on the empty string before the next phrase starts. */
const GAP_MS = 320;

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
      mode === 'holding' ? HOLD_MS : mode === 'deleting' ? (length === 0 ? GAP_MS : DELETE_MS) : TYPE_MS;

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
        <span className="ws-caret ml-0.5 inline-block w-[0.08em] -translate-y-[0.04em] self-stretch bg-accent align-baseline text-transparent">
          {/* A zero-width-ish glyph gives the caret its line height without a
              fixed px value that would drift from the font size. */}
          &nbsp;
        </span>
      </span>
      <span className="sr-only">{phrases.join(' ')}</span>
    </span>
  );
};
