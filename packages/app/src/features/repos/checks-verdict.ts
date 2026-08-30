import type { ForgeRun } from '@midnite/studio-shared';

import type { ChecksVerdict } from './branch-health';

/**
 * The missing producer for `branchHealth`'s `checks` seam.
 *
 * `ChecksVerdict` has existed since Phase 13 with nothing supplying one — see
 * `todo/outstanding.md` → "Branch checks (the RAG dot's real source)", which
 * names exactly this: the last GitHub Actions conclusion for the branch's head
 * commit. This is that function, and it is pure so the mapping from "what CI
 * said" to "what colour the dot is" can be argued with in a test rather than
 * inferred from a screenshot.
 *
 * Matched on SHA, never on branch name. A run carries the commit it ran
 * against; the branch has since moved on in the common case, and reporting a
 * green tick for a run that tested two commits ago is worse than reporting
 * nothing — it is the precise failure that makes people stop trusting the dot.
 */
export function checksVerdict(
  runs: readonly ForgeRun[] | undefined,
  headSha: string | null | undefined,
): ChecksVerdict | undefined {
  if (!runs || !headSha) return undefined;

  const forSha = runs.filter((run) => run.headSha === headSha);
  if (forSha.length === 0) return undefined;

  // Newest per workflow: a workflow re-run supersedes its predecessor, and
  // counting both would report a failure that has since been fixed.
  const newest = new Map<string, ForgeRun>();
  for (const run of forSha) {
    const held = newest.get(run.name);
    if (!held || run.createdAt > held.createdAt) newest.set(run.name, run);
  }
  const latest = [...newest.values()];

  const failed = latest.filter(
    (run) =>
      run.status === 'completed' &&
      (run.conclusion === 'failure' ||
        run.conclusion === 'timed_out' ||
        run.conclusion === 'startup_failure'),
  );
  if (failed.length > 0) {
    return {
      level: 'fail',
      summary: `${failed.length} of ${latest.length} ${plural(latest.length, 'check')} failed`,
    };
  }

  const running = latest.filter((run) => run.status !== 'completed');
  if (running.length > 0) {
    return {
      level: 'warn',
      summary: `${running.length} of ${latest.length} ${plural(latest.length, 'check')} still running`,
    };
  }

  const passed = latest.filter((run) => run.conclusion === 'success');
  if (passed.length === 0) {
    /*
      Every run finished, none passed and none failed — a set that is entirely
      skipped, cancelled or neutral. That is not a green light and it is not a
      red one; `unknown` (returning undefined) is the honest answer, and it is
      the state the dot was designed to render as nothing at all.
    */
    return undefined;
  }

  return {
    level: 'ok',
    summary: `${passed.length} of ${latest.length} ${plural(latest.length, 'check')} passed`,
  };
}

const plural = (count: number, word: string): string => (count === 1 ? word : `${word}s`);
