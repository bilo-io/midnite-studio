import { resourceRefLabel, type ResourceRef } from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';
import { useActionsStore } from '../../../store/actions-store';
import { openIssueModal } from '../../../store/issue-modal-store';
import { useReviewsStore } from '../../../store/reviews-store';
import { useUiStore } from '../../../store/ui-store';
import { useCommitFileRequest } from '../../../features/commit/commit-file-request';
import { useFilesStore } from '../../../features/files/files-store';
import { revealCommit } from '../../../features/graph/reveal-commit';
import type { FamilyRevealers, RevealOutcome } from '@midnite/studio-feature-companion/renderer';

/**
 * Git + forge — Phase 112 Theme C.
 *
 * The engine has already switched repo and view by the time any of these run,
 * so each one only selects, scrolls and highlights. None of them checks out,
 * stages, merges or re-runs anything.
 */
export type GitResourceKind = 'commit' | 'ref' | 'stash' | 'file' | 'commitFile' | 'pull' | 'issue' | 'ciRun';

const revealed = (ref: ResourceRef, say?: string): RevealOutcome => ({
  ok: true,
  did: 'revealed',
  label: resourceRefLabel(ref),
  ...(say === undefined ? {} : { say }),
});

const notFound = (say: string): RevealOutcome => ({ ok: false, reason: 'not-found', say });

const FILTER_CLEARED = ' The branch filter was hiding it, so I cleared it.';

async function landOnCommit(
  ref: ResourceRef,
  repoId: string,
  rev: string,
  refFullName: string | null = null,
): Promise<{ outcome: RevealOutcome; sha: string | null }> {
  const result = await revealCommit(repoId, rev, { refFullName });
  if (!result.ok) return { outcome: notFound(result.say), sha: null };
  const label = resourceRefLabel(ref);
  return {
    outcome: revealed(ref, result.clearedFilter ? `Here's ${label}.${FILTER_CLEARED}` : undefined),
    sha: result.sha,
  };
}

/** `stash@{n}` — the selector every stash op and `graphSelection` takes. */
export const stashSelector = (index: number): string => `stash@{${index}}`;

export const GIT_REVEALERS: FamilyRevealers<GitResourceKind> = {
  commit: {
    view: 'graph',
    reveal: async (ref) => {
      return (await landOnCommit(ref, ref.repoId, ref.sha)).outcome;
    },
  },

  ref: {
    view: 'graph',
    reveal: async (ref) => {
      const refs = (await bridge()?.repos.refs({ repoId: ref.repoId })) ?? [];
      const found = refs.find((candidate) => candidate.fullName === ref.fullName);
      if (!found) return notFound(`I can't find ${resourceRefLabel(ref)} in this repository.`);
      return (await landOnCommit(ref, ref.repoId, found.sha, found.fullName)).outcome;
    },
  },

  stash: {
    view: 'graph',
    reveal: async (ref) => {
      const stashes = (await bridge()?.stash.list({ repoId: ref.repoId })) ?? [];
      const selector = stashSelector(ref.index);
      if (!stashes.some((entry) => entry.selector === selector)) {
        return notFound(`There's no ${resourceRefLabel(ref)} in this repository.`);
      }
      useUiStore.getState().selectStash(selector);
      return revealed(ref);
    },
  },

  file: {
    view: 'files',
    reveal: async (ref) => {
      useFilesStore.getState().revealFile(ref.path, ref.line);
      return revealed(ref);
    },
  },

  commitFile: {
    view: 'graph',
    reveal: async (ref) => {
      const { outcome, sha } = await landOnCommit(ref, ref.repoId, ref.sha);
      if (sha !== null) useCommitFileRequest.getState().expandFile(sha, ref.path);
      return outcome;
    },
  },

  pull: {
    view: 'reviews',
    reveal: async (ref) => {
      useReviewsStore.getState().selectPull(ref.repoId, ref.number);
      return revealed(ref);
    },
  },

  issue: {
    view: 'tasks',
    reveal: async (ref) => {
      openIssueModal({ repoId: ref.repoId, number: ref.number });
      return revealed(ref);
    },
  },

  ciRun: {
    view: 'actions',
    reveal: async (ref) => {
      const actions = useActionsStore.getState();
      actions.selectRun(ref.repoId, ref.runId);
      if (ref.jobId !== undefined) actions.selectJob(ref.repoId, ref.jobId);
      return revealed(ref);
    },
  },
};
