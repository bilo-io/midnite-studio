import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Continuously types and erases text in a loop with a typewriter effect.
 * Useful for loading states that cycle.
 *
 * The cycle is: type the text, hold it for `holdMs`, erase it, pause for `pauseMs`, repeat.
 * Respects `prefers-reduced-motion` and shows the full text immediately.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useLoopingTypewriter(
  text: string,
  options: {
    /** Milliseconds between each character (min 16, max 42, auto-scales by text length). Defaults to auto-scale. */
    charDelayMs?: number;
    /** Milliseconds to hold the full text before erasing. Default 500. */
    holdMs?: number;
    /** Milliseconds to pause between erase complete and typing again. Default 200. */
    pauseMs?: number;
  } = {},
) {
  const { charDelayMs, holdMs = 500, pauseMs = 200 } = options;
  const [displayed, setDisplayed] = useState(text);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || !text) {
      setDisplayed(text);
      return;
    }

    let animationPhase: 'typing' | 'holding' | 'erasing' | 'pausing' = 'typing';
    let charIndex = 0;

    const cleanup = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const startTyping = () => {
      animationPhase = 'typing';
      charIndex = 0;
      const perChar = charDelayMs ?? Math.max(16, Math.min(42, Math.round(720 / text.length)));

      intervalRef.current = setInterval(() => {
        charIndex += 1;
        setDisplayed(text.slice(0, charIndex));

        if (charIndex >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          animationPhase = 'holding';

          // Hold the full text
          timeoutRef.current = setTimeout(() => {
            animationPhase = 'erasing';
            startErasing();
          }, holdMs);
        }
      }, perChar);
    };

    const startErasing = () => {
      animationPhase = 'erasing';
      charIndex = text.length;
      const perChar = charDelayMs ?? Math.max(16, Math.min(42, Math.round(720 / text.length)));

      intervalRef.current = setInterval(() => {
        charIndex -= 1;
        setDisplayed(text.slice(0, charIndex));

        if (charIndex <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          animationPhase = 'pausing';

          // Pause before restarting
          timeoutRef.current = setTimeout(() => {
            startTyping();
          }, pauseMs);
        }
      }, perChar);
    };

    startTyping();

    return cleanup;
  }, [text, charDelayMs, holdMs, pauseMs]);

  return displayed;
}
