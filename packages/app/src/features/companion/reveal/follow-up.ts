import {
  resourceRefLabel,
  resourceRefsEqual,
  type ForgePullsResult,
  type ForgeRunsResult,
  type ResourceKind,
  type ResourceRef,
  type ResourceRelatedKind,
} from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';
import { keys } from '../../../services/queries';
import { useReviewsStore } from '../../../store/reviews-store';
import { useSessionsStore } from '../../../store/sessions-store';
import { useUiStore } from '../../../store/ui-store';
import { useChatsStore } from '../../chats/chats-store';
import { useGraphStore } from '../../graph/graph-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { REVEAL_HISTORY_LIMIT, useRevealHistory } from './reveal-history';
import { cached } from './sources/util';

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

function liveSelection(): ResourceRef | null {
  const ui = useUiStore.getState();
  const repoId = ui.selectedRepoId;
  switch (ui.activeView) {
    case 'chats': {
      const id = useChatsStore.getState().selectedId;
      return id === null ? null : { kind: 'chat', id };
    }
    case 'graph': {
      const selection = ui.graphSelection;
      return repoId !== null && selection?.kind === 'commit'
        ? { kind: 'commit', repoId, sha: selection.sha }
        : null;
    }
    case 'reviews': {
      const number = repoId === null ? undefined : useReviewsStore.getState().selectedPull[repoId];
      return repoId !== null && number !== undefined ? { kind: 'pull', repoId, number } : null;
    }
    case 'sessions': {
      const id = useSessionsStore.getState().selectedLiveSessionId;
      return id === null ? null : { kind: 'session', id };
    }
    default:
      return null;
  }
}

async function liveSiblings(ref: ResourceRef): Promise<readonly ResourceRef[] | null> {
  switch (ref.kind) {
    case 'chat':
      return useChatsStore.getState().list.map((chat) => ({ kind: 'chat' as const, id: chat.id }));
    case 'commit':
      return useGraphStore.getState().repoId === ref.repoId
        ? useGraphStore.getState().rows.map((row) => ({ kind: 'commit' as const, repoId: ref.repoId, sha: row.commit.sha }))
        : null;
    case 'session':
      return useTerminalStore
        .getState()
        .sessions.filter((session) => session.surface !== 'fab')
        .map((session) => ({ kind: 'session' as const, id: session.id }));
    case 'pull': {
      const seen = new Set<number>();
      const pulls = cached<ForgePullsResult>([...keys.forge(ref.repoId), 'pulls'])
        .flatMap((result) => result.pulls)
        .filter((pull) => !seen.has(pull.number) && seen.add(pull.number))
        .sort((a, b) => b.number - a.number);
      return pulls.map((pull) => ({ kind: 'pull' as const, repoId: ref.repoId, number: pull.number }));
    }
    default:
      return null;
  }
}

async function liveRelated(from: ResourceRef, to: ResourceRelatedKind): Promise<ResourceRef | null> {
  const api = bridge();
  const runs = (repoId: string) => cached<ForgeRunsResult>([...keys.forge(repoId), 'runs']).flatMap((result) => result.runs);
  const pullHead = async (repoId: string, number: number): Promise<string | null> =>
    (await api?.forge.pullDetail({ repoId, number }))?.detail?.headSha ?? null;

  if (from.kind === 'pull') {
    const sha = await pullHead(from.repoId, from.number);
    if (sha === null) return null;
    if (to === 'commit') return { kind: 'commit', repoId: from.repoId, sha };
    if (to === 'ciRun') {
      const run = runs(from.repoId).find((candidate) => candidate.headSha === sha);
      return run ? { kind: 'ciRun', repoId: from.repoId, runId: run.id } : null;
    }
  }
  if (from.kind === 'ciRun') {
    const run = runs(from.repoId).find((candidate) => candidate.id === from.runId);
    if (!run?.headSha) return null;
    if (to === 'commit') return { kind: 'commit', repoId: from.repoId, sha: run.headSha };
    if (to === 'pull') return pullForSha(from.repoId, run.headSha, pullHead);
  }
  if (from.kind === 'commit') {
    if (to === 'ciRun') {
      const run = runs(from.repoId).find((candidate) => candidate.headSha !== null && from.sha.length >= 7 && candidate.headSha.startsWith(from.sha));
      return run ? { kind: 'ciRun', repoId: from.repoId, runId: run.id } : null;
    }
    if (to === 'pull') return pullForSha(from.repoId, from.sha, pullHead);
  }
  return null;
}

/** Open PRs first: a head sha is only a PR's head while the PR is open, and each probe is a `gh` call. */
const PULL_PROBE_CAP = 8;

async function pullForSha(
  repoId: string,
  sha: string,
  pullHead: (repoId: string, number: number) => Promise<string | null>,
): Promise<ResourceRef | null> {
  const seen = new Set<number>();
  const open = cached<ForgePullsResult>([...keys.forge(repoId), 'pulls'])
    .flatMap((result) => result.pulls)
    .filter((pull) => pull.state === 'open' && !seen.has(pull.number) && seen.add(pull.number))
    .slice(0, PULL_PROBE_CAP);
  for (const pull of open) {
    const head = await pullHead(repoId, pull.number);
    if (head !== null && head.startsWith(sha)) return { kind: 'pull', repoId, number: pull.number };
  }
  return null;
}

export function liveFollowUpDeps(): FollowUpDeps {
  return {
    selection: liveSelection,
    history: () => useRevealHistory.getState().entries.slice(0, REVEAL_HISTORY_LIMIT).map((entry) => entry.ref),
    siblings: liveSiblings,
    related: liveRelated,
  };
}
