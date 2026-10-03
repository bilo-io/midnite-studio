import { useEffect, useState } from 'react';

import { nextRandomIndex, WORD_SETS } from '../screensaver/screensaver-words';

/**
 * The verbs a chat's "Thinking" label cycles through while a turn runs — the
 * same idea as Claude Code's spinner verbs, drawn from the screensaver's own
 * `active` vocabulary so the app keeps one voice. Only the single-word `-ing`
 * entries qualify: "crushing it" or "shipping it, ma bru" would not read as a
 * one-word status beside a spinner.
 */
export const THINKING_VERBS: readonly string[] = WORD_SETS.active
  .filter((word) => /^[a-z]+ing$/.test(word))
  .map((word) => word[0]!.toUpperCase() + word.slice(1));

export const THINKING_VERB_INTERVAL_MS = 2_400;

/**
 * The verb to show right now: a random first pick, then a different random one
 * every `intervalMs` — but only while `active`. Once the turn ends the label
 * stops on whatever it last showed and the caller swaps in "Thought for 12s".
 */
export function useThinkingVerb(active: boolean, intervalMs = THINKING_VERB_INTERVAL_MS): string {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * THINKING_VERBS.length));
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setIndex((i) => nextRandomIndex(THINKING_VERBS.length, i)), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return THINKING_VERBS[index] ?? 'Thinking';
}
