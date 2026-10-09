import type { ForgeComment, ForgeReviewThread, ForgeRun } from '@midnite/studio-shared';

/**
 * The numbers beside the PR detail tab titles, GitHub's Counter style.
 *
 * `null` means "unknown or zero" and renders no pill: a pill still waiting on
 * its fetch must not read as `0`, and an empty tab's `0` says nothing the empty
 * panel does not. GitHub makes the same choice for Conversation and Checks.
 */
export type PrTabCounts = {
  files: number | null;
  conversation: number | null;
  checks: number | null;
};

const positive = (n: number | null): number | null => (n !== null && n > 0 ? n : null);

/**
 * Conversation counts exactly what that tab renders: every timeline entry
 * (discussion comments and review submissions) plus every comment inside an
 * inline review thread.
 */
export function conversationCount(
  comments: readonly ForgeComment[] | null,
  threads: readonly ForgeReviewThread[] | null,
): number | null {
  if (comments === null && threads === null) return null;
  const inThreads = (threads ?? []).reduce((sum, thread) => sum + thread.comments.length, 0);
  return positive((comments?.length ?? 0) + inThreads);
}

/** Checks counts the workflow runs for this exact head commit, as the tab lists them. */
export function checksCount(
  runs: readonly ForgeRun[] | null,
  headSha: string | null,
): number | null {
  if (runs === null || headSha === null) return null;
  return positive(runs.filter((run) => run.headSha === headSha).length);
}

export function filesCount(changedFiles: number | null): number | null {
  return positive(changedFiles);
}
