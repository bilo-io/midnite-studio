import { resourceKindWord, parseResourceQuery, type CompanionIntent, type ResourceRef } from '@midnite/studio-shared';

import type { PendingChoiceAction } from '../../store/companion-store';
import { say } from './concierge';
import type { HandoffDeps } from './handoff';
import { CHOICE_LIMIT, countWord, parseChoice, type ChoiceOption } from './reveal/choice';
import type { FollowUpRequest, FollowUpResult } from './reveal/follow-up';

/**
 * The companion's voice for resource requests (Phase 112 Theme H) — the
 * `navigate` intent's `query` and `reference` arms, kept beside `handoff.ts` for
 * the reason `profile-handoff.ts` is: the file other themes also edit grows by
 * one `case`.
 *
 * One match opens it. Several ask — "Three chats match — the first is Auth
 * rewrite." — and post numbered chips through the one pending slot. None says
 * so. A request that asks for the *newest* ("my last chat") or names an exact id
 * ("PR 812") opens its best match without asking: there is only one right answer
 * and it ranks first.
 */

export type ResourceFindMatch = { ref: ResourceRef; title: string; detail?: string | undefined; score: number };

/** What the arms need from the app — `findResources` and `resolveFollowUp` live in `runtime.ts`, fakes in a test. */
export type CompanionResourcePort = {
  find: (query: string, limit: number) => Promise<readonly ResourceFindMatch[]>;
  followUp: (request: FollowUpRequest) => Promise<FollowUpResult>;
  /** A score at or above this is an exact id (`EXACT_SCORE`). */
  exactScore: number;
};

type Navigate = Extract<CompanionIntent, { kind: 'navigate' }>;

/** A choice stays open this long. The same minute every other pending question gets. */
export const CHOICE_MEMORY_MS = 60 * 1000;

const plural = (word: string): string => (word.endsWith('s') ? word : `${word}s`);

function nounFor(query: string): string {
  const head = parseResourceQuery(query).headWord;
  if (head === null) return 'things';
  return plural(resourceKindWord(head) ? head : 'thing');
}

async function open(ref: ResourceRef, deps: HandoffDeps): Promise<void> {
  const outcome = await deps.navigate({ kind: 'navigate', target: ref });
  await say(deps, outcome.say);
}

/** The `navigate` intent's resource arms: an unresolved `query`, or a follow-up `reference`. */
export async function actOnResource(intent: Navigate, deps: HandoffDeps): Promise<void> {
  if (intent.query !== undefined) return findAndOpen(intent.query, deps);
  const result = await deps.resource.followUp({
    reference: intent.reference ?? 'this',
    about: intent.about,
    related: intent.related,
  });
  if (!result.ok) {
    await say(deps, result.say);
    return;
  }
  await open(result.ref, deps);
}

async function findAndOpen(query: string, deps: HandoffDeps): Promise<void> {
  const parsed = parseResourceQuery(query);
  const matches = await deps.resource.find(query, CHOICE_LIMIT);
  const first = matches[0];
  if (first === undefined) {
    const kind = parsed.headWord ?? 'thing';
    const rest = parsed.description !== '' ? ` matching ${parsed.description}` : '';
    await say(deps, `I couldn't find a ${kind}${rest}.`);
    return;
  }
  const decisive = matches.length === 1 || parsed.recency !== null || first.score >= deps.resource.exactScore;
  if (decisive) {
    await open(first.ref, deps);
    return;
  }
  const options: ChoiceOption[] = matches.slice(0, CHOICE_LIMIT).map(({ ref, title, detail }) => ({ ref, title, detail }));
  const label = `${countWord(options.length)} ${nounFor(query)} match`;
  const choice: PendingChoiceAction = { kind: 'choice', label, at: Date.now(), options };
  deps.setPendingAction(choice);
  const sentence = `${label.charAt(0).toUpperCase()}${label.slice(1)} — the first is ${first.title}.`;
  await say(deps, sentence);
}

/**
 * A reply made while a choice is pending. `true` when it picked one (and opened
 * it); `false` when it did not, so the line carries on to be read as a request.
 */
export async function takeChoice(text: string, deps: HandoffDeps): Promise<boolean> {
  const pending = deps.pendingAction();
  if (pending?.kind !== 'choice') return false;
  if (Date.now() - pending.at > CHOICE_MEMORY_MS) {
    deps.setPendingAction(null);
    return false;
  }
  const index = parseChoice(text, pending.options.length);
  if (index === null) return false;
  deps.setPendingAction(null);
  await open(pending.options[index]!.ref, deps);
  return true;
}

/** "Yes", Return, or the Run chip on a choice — the first one, as it was read out. */
export async function confirmChoice(pending: PendingChoiceAction, deps: HandoffDeps): Promise<void> {
  deps.setPendingAction(null);
  await open(pending.options[0]!.ref, deps);
}
