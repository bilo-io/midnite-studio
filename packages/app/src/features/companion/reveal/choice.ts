import type { ResourceRef } from '@midnite/studio-shared';

/**
 * Phase 112 Theme H — the numbered chips a vague request leaves behind.
 *
 * "Open my chat about auth" matching three chats is a question, not a guess:
 * the companion says how many, reads the first, and posts chips numbered 1…n.
 * Answering is any of: a chip click (which submits its number), "two", "the
 * second", "number 2", or a bare yes / Return (the first).
 */

export type ChoiceOption = { ref: ResourceRef; title: string; detail?: string | undefined };

/** The chips shown, and so the most a spoken list ever asks the user to hold in their head. */
export const CHOICE_LIMIT = 5;

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;
const ORDINAL_WORDS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'] as const;

/** "Three chats match" — a count as a word, up to ten, then digits. */
export const countWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

/**
 * Which option a reply picks, as a 0-based index, or `null` when the reply is
 * not a pick at all (so it goes on to be read as a new request, which replaces
 * the choice). Whole replies only — "two" picks, "two commits ago" does not.
 */
export function parseChoice(text: string, count: number): number | null {
  const s = text
    .toLowerCase()
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:the|number|no|option|choice|pick|choose|open|show|go with)\s+)+/, '')
    .replace(/(?:\s+(?:one|please))+$/, '')
    .trim();
  if (s === 'last' && count > 0) return count - 1;
  const digit = /^#?(\d{1,2})$/.exec(s);
  let n: number | null = digit ? Number(digit[1]) : null;
  if (n === null) {
    const word = NUMBER_WORDS.indexOf(s as (typeof NUMBER_WORDS)[number]);
    const ordinal = ORDINAL_WORDS.indexOf(s as (typeof ORDINAL_WORDS)[number]);
    n = word > 0 ? word : ordinal > 0 ? ordinal : null;
  }
  return n !== null && n >= 1 && n <= count ? n - 1 : null;
}
