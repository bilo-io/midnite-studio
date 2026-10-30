import {
  type ForgePullsResult,
  type ForgeRunsResult,
  type ResourceRef,
  type ResourceRelatedKind,
} from '@midnite/studio-shared';
import { useChatsStore } from '@midnite/studio-feature-chats/renderer';
import { bridge, useGraphStore } from '@midnite/studio-frame';

import { keys } from '../../services/queries';
import { useReviewsStore } from '../../store/reviews-store';
import { useSessionsStore } from '../../store/sessions-store';
import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../../features/terminal/terminal-store';
import { cached } from './sources/util';

/**
 * The live reads behind a follow-up ("this chat", "the next one", "its PR") — Studio's half of
 * `reveal/follow-up.ts` (Phase 123 Theme F). They read the selection of Studio's own pages, so they
 * sit with the stores they read and reach the companion through its `CompanionHost.followUp`.
 */

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

export const studioFollowUpReads = { selection: liveSelection, siblings: liveSiblings, related: liveRelated };
