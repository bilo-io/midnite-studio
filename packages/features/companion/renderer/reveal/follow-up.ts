import {
  resourceRefLabel,
  resourceRefsEqual,
  type ResourceKind,
  type ResourceRef,
  type ResourceRelatedKind,
} from '@midnite/studio-shared';

import { getCompanionHost } from '../host';
import { REVEAL_HISTORY_LIMIT, useRevealHistory } from './reveal-history';

/**
 * Phase 112 Theme H — follow-ups: "this chat", "the next one", "its PR".
 *
 * A follow-up names no description to search for — it is relative to where the
 * person is. So it reads the live selection of the page they are on, falls back
 * to the last thing the companion revealed (`lastRevealed`), and answers with a
 * `ResourceRef` the one reveal engine opens, or a sentence saying why not.
 * Everything it reads is injected, so the table of rules is testable without a
 * store in sight.
 */

export type FollowUpRequest = {
  reference: 'this' | 'next' | 'previous' | 'parent' | 'back';
  about?: ResourceKind | undefined;
  related?: ResourceRelatedKind | undefined;
};

export type FollowUpResult = { ok: true; ref: ResourceRef } | { ok: false; say: string };

export type FollowUpDeps = {
  /** What the page in front of the user has selected, if it has one. */
  selection: () => ResourceRef | null;
  /** Newest first — `useRevealHistory`'s refs. */
  history: () => readonly ResourceRef[];
  /** The ordered list `ref` sits in (chats by recency, graph rows, PR list…), or `null` when the kind has none to step through. */
  siblings: (ref: ResourceRef) => Promise<readonly ResourceRef[] | null>;
  /** The `RELATED` hop: this commit's PR, this PR's head commit… `null` when there is none. */
  related: (ref: ResourceRef, to: ResourceRelatedKind) => Promise<ResourceRef | null>;
};

const KIND_NOUN: Partial<Record<ResourceKind, string>> = {
  commit: 'commit',
  pull: 'pull request',
  ciRun: 'CI run',
  chat: 'chat',
  session: 'session',
  card: 'card',
};
const noun = (kind: ResourceKind): string => KIND_NOUN[kind] ?? 'thing';

/** Where a hop can start. Anything else has no `RELATED` row, and the companion says so. */
export const RELATED: Readonly<Partial<Record<ResourceKind, readonly ResourceRelatedKind[]>>> = {
  commit: ['pull', 'ciRun'],
  pull: ['commit', 'ciRun'],
  ciRun: ['commit', 'pull'],
};

function current(request: FollowUpRequest, deps: FollowUpDeps): ResourceRef | null {
  const wanted = (ref: ResourceRef): boolean => request.about === undefined || ref.kind === request.about;
  const selected = deps.selection();
  if (selected && wanted(selected)) return selected;
  return deps.history().find(wanted) ?? null;
}

/** Resolve one follow-up to a ref. `back` is not one — it is a command, and handoff runs it. */
export async function resolveFollowUp(request: FollowUpRequest, deps: FollowUpDeps): Promise<FollowUpResult> {
  const from = current(request, deps);
  if (from === null) {
    return {
      ok: false,
      say:
        request.about !== undefined
          ? `There's no ${noun(request.about)} selected.`
          : "I'm not sure which one you mean — open something first.",
    };
  }

  if (request.reference === 'next' || request.reference === 'previous') {
    const list = await deps.siblings(from);
    if (list === null) return { ok: false, say: `I can't step through ${noun(from.kind)}s yet.` };
    const at = list.findIndex((candidate) => resourceRefsEqual(candidate, from));
    if (at === -1) return { ok: false, say: `I lost my place in the ${noun(from.kind)} list.` };
    const target = list[request.reference === 'next' ? at + 1 : at - 1];
    if (target === undefined) {
      return { ok: false, say: `That's the ${request.reference === 'next' ? 'last' : 'first'} ${noun(from.kind)}.` };
    }
    return { ok: true, ref: target };
  }

  if (request.related !== undefined) {
    if (!RELATED[from.kind]?.includes(request.related)) {
      return { ok: false, say: `I can't get from ${resourceRefLabel(from)} to a ${noun(request.related)}.` };
    }
    const hop = await deps.related(from, request.related);
    return hop === null
      ? { ok: false, say: `I couldn't find a ${noun(request.related)} for ${resourceRefLabel(from)}.` }
      : { ok: true, ref: hop };
  }

  return { ok: true, ref: from };
}

// --- live wiring -------------------------------------------------------------

/**
 * The live reads come from the host (Phase 123 Theme F): "this chat", "the next one" and "its PR"
 * read the selection of pages only the composing app has — Studio's are
 * `packages/app/src/compose/companion/follow-up-live.ts`. The history is the engine's own.
 */
export function liveFollowUpDeps(): FollowUpDeps {
  const reads = getCompanionHost().followUp;
  return {
    selection: reads.selection,
    history: () => useRevealHistory.getState().entries.slice(0, REVEAL_HISTORY_LIMIT).map((entry) => entry.ref),
    siblings: reads.siblings,
    related: reads.related,
  };
}
