import type { Ref } from '@midnite/studio-shared';

/**
 * How many local branches the repo has, for the graph footer's branch count.
 *
 * Local only — a remote-tracking ref isn't one of "your" branches, and
 * counting both would double an ordinary `main` + `origin/main` pair.
 */
export function countLocalBranches(refs: readonly Ref[]): number {
  return refs.filter((ref) => ref.kind === 'localBranch').length;
}
