import { parseResourceQuery, resourceKindWord } from './domain/resource-query';
import type { ResourceKind } from './domain/resource-ref';

/**
 * Phase 112 Theme H — the companion's grammar for "a thing inside a page".
 *
 * `shared` only *recognises the shape*; it never chooses among candidates (the
 * app's `findResources` does). Three families, all pure string reads:
 *
 *   - a **target phrase** after a navigate verb — "my last chat about auth",
 *     "PR 812" — that names a kind plus a description, a recency word or an exact id;
 *   - a **follow-up** — "this chat", "the next one", "its PR";
 *   - "go back".
 *
 * `parseIntent` calls these from inside its vocabulary block; the precedence
 * between families (repo → agent/model → view → resource) is written there.
 */

/** What a follow-up phrase can hop to: the `RELATED` map's targets (`reveal/follow-up.ts`). */
export const RESOURCE_RELATED_KINDS = ['pull', 'commit', 'ciRun', 'card'] as const;
export type ResourceRelatedKind = (typeof RESOURCE_RELATED_KINDS)[number];

export type ResourceFollowUp = {
  reference: 'this' | 'next' | 'previous' | 'back';
  /** "this chat", "the next commit" — the kind the follow-up has to be about. */
  about?: ResourceKind;
  /** "its PR" — hop from the current thing to this kind. */
  related?: ResourceRelatedKind;
};

/**
 * Whether `remainder` — what is left after a navigate verb — describes a
 * resource rather than a view: it names a kind and then says *which* (words, a
 * recency word), or it carries an exact id. A bare kind ("chats", "the model")
 * stays a view, so "open chats" keeps landing on the Chats page.
 */
export function describesResource(remainder: string): boolean {
  const query = parseResourceQuery(remainder);
  if (query.exact.length > 0) return true;
  return query.kinds.length > 0 && (query.recency !== null || query.terms.length > 0);
}

const VERB = String.raw`(?:(?:please\s+)?(?:open|show\s+me|show|go\s+to|take\s+me\s+to|bring\s+up|pull\s+up|jump\s+to|switch\s+to)\s+)?`;
const RELATED_WORDS: Readonly<Record<string, ResourceRelatedKind>> = {
  pr: 'pull',
  'pull request': 'pull',
  commit: 'commit',
  run: 'ciRun',
  'ci run': 'ciRun',
  build: 'ciRun',
  card: 'card',
  task: 'card',
};
const RELATED_ALT = Object.keys(RELATED_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');

/** A single kind word ("chat", "commits") as one `ResourceKind`, or `undefined` when it is none or ambiguous. */
function singleKind(word: string | undefined): ResourceKind | undefined {
  if (word === undefined) return undefined;
  const kinds = resourceKindWord(word.toLowerCase())?.kinds;
  return kinds?.length === 1 ? kinds[0] : undefined;
}

const clean = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s+(?:please|now|thanks))+$/, '')
    .trim();

/**
 * "go back" — the panel history's Back, exactly as `Mod+[` reads it. Whole
 * utterances only, so "go back to the graph" stays a navigate.
 */
export function matchGoBack(text: string): boolean {
  return /^(?:(?:please\s+)?(?:go|take me|bring me|jump) back|back one|go back one)$/.test(clean(text));
}

/**
 * "this chat", "the next one", "the previous commit", "its PR", "the PR for
 * this commit". `null` for anything else, including "open the next chapter"
 * (a kind word is optional, but a non-kind word after "next" is not a follow-up).
 */
export function matchFollowUp(text: string): ResourceFollowUp | null {
  const s = clean(text);
  if (s === '') return null;

  const relatedHop = new RegExp(
    String.raw`^${VERB}(?:its|(?:this|that)\s+([a-z]+)'s|the same\s+([a-z]+)'s)\s+(${RELATED_ALT})$`,
  ).exec(s);
  if (relatedHop) {
    const kind = singleKind(relatedHop[1] ?? relatedHop[2]);
    return { reference: 'this', related: RELATED_WORDS[relatedHop[3]!]!, ...(kind ? { about: kind } : {}) };
  }
  const relatedFor = new RegExp(
    String.raw`^${VERB}(?:the\s+)?(${RELATED_ALT})\s+(?:for|of|from|behind)\s+(?:this|that|it)(?:\s+([a-z]+))?$`,
  ).exec(s);
  if (relatedFor) {
    const kind = singleKind(relatedFor[2]);
    return { reference: 'this', related: RELATED_WORDS[relatedFor[1]!]!, ...(kind ? { about: kind } : {}) };
  }

  const step = new RegExp(
    String.raw`^${VERB}(?:the\s+)?(next|following|previous|prev|one before|one after)(?:\s+(?:one|([a-z]+)))?$`,
  ).exec(s);
  if (step) {
    const word = step[2];
    const kind = singleKind(word);
    if (word !== undefined && kind === undefined) return null;
    const direction = step[1] === 'next' || step[1] === 'following' || step[1] === 'one after' ? 'next' : 'previous';
    return { reference: direction, ...(kind ? { about: kind } : {}) };
  }

  // "this" needs a verb or a kind word — a bare "this" is not a request.
  const here = new RegExp(String.raw`^${VERB}(?:this|that|the current)(?:\s+(one|[a-z]+))?$`).exec(s);
  if (here) {
    const word = here[1];
    const kind = word === undefined || word === 'one' ? undefined : singleKind(word);
    if (word !== undefined && word !== 'one' && kind === undefined) return null;
    if (kind === undefined && !/^(?:please\s+)?(?:open|show|go|take|bring|pull|jump|switch)/.test(s)) return null;
    return { reference: 'this', ...(kind ? { about: kind } : {}) };
  }
  return null;
}
