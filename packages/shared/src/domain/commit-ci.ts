import { z } from 'zod';

import { latestPerWorkflow } from './checks-verdict';
import { ForgeCliStatusSchema, ForgeRunSchema, type ForgeRun } from './forge';

/**
 * A commit's CI, as the git graph's CI column reads it.
 *
 * Pure and zod-only so the renderer (the column, the run modal) and main (the
 * batched lookup's cache, which has to know whether an answer is still moving)
 * share one rule. It builds on `checksVerdict`'s own `latestPerWorkflow`: a
 * re-run supersedes the attempt before it, so a commit whose flaky job was
 * re-run green does not keep a red mark from the run it replaced.
 */

/**
 * Precedence, lowest wins. Failure beats everything; then a run that is
 * actually moving; then one waiting for a runner or a person; then the
 * settled verdicts, loudest first.
 *
 * The same order `checksVerdict` reads its three levels in — fail, then
 * still-running, then passed — spread across the seven states the column can
 * draw. `success` ranks above `cancelled`/`neutral`/`skipped` for the reason
 * `checksVerdict` returns `ok` when anything passed and nothing failed: a
 * workflow that correctly declined to run does not make the commit less green.
 */
export function commitRunRank(run: Pick<ForgeRun, 'status' | 'conclusion'>): number {
  switch (run.status) {
    case 'in_progress':
      return 1;
    case 'waiting':
    case 'queued':
    case 'requested':
    case 'pending':
      return 2;
    case 'completed':
      break;
  }
  switch (run.conclusion) {
    case 'failure':
    case 'startup_failure':
    case 'timed_out':
      return 0;
    case 'action_required':
      return 3;
    case 'success':
      return 4;
    case 'cancelled':
      return 5;
    case 'neutral':
    case 'stale':
      return 6;
    case 'skipped':
      return 7;
    default:
      return 8;
  }
}

/** Newest first, by the one timestamp every run carries. */
const newestFirst = (a: ForgeRun, b: ForgeRun): number => b.createdAt.localeCompare(a.createdAt);

/** Most relevant first: precedence, then newest. What the run modal's picker lists. */
export function orderCommitRuns(runs: readonly ForgeRun[]): ForgeRun[] {
  return [...runs].sort((a, b) => commitRunRank(a) - commitRunRank(b) || newestFirst(a, b));
}

export type CommitCi = {
  /**
   * The run whose state stands for the commit — its status and conclusion are
   * what the column draws, through the Actions page's own `outcomeStatus`.
   */
  representative: ForgeRun;
  /** The newest run per workflow, most relevant first. */
  runs: ForgeRun[];
  /** Whether anything is still queued or running — the only reason to poll. */
  active: boolean;
};

/**
 * One commit's runs, aggregated. `null` for a commit with no CI at all — which
 * the column draws as nothing, never as a grey mark.
 */
export function aggregateCommitRuns(runs: readonly ForgeRun[] | undefined): CommitCi | null {
  if (!runs || runs.length === 0) return null;
  const ordered = orderCommitRuns(latestPerWorkflow(runs));
  const [representative] = ordered;
  if (!representative) return null;
  return {
    representative,
    runs: ordered,
    active: ordered.some((run) => run.status !== 'completed'),
  };
}

/** Whether any run in the set is still queued or running. */
export const hasActiveRun = (runs: readonly ForgeRun[]): boolean =>
  runs.some((run) => run.status !== 'completed');

/**
 * A commit sha — 40 hex for SHA-1, 64 for a SHA-256 repository. Bounded at the
 * boundary because main splices it into a `gh run list --commit` line.
 */
export const CommitShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, 'a full commit sha');

/**
 * The most shas one batched lookup may name. The graph asks per page of
 * visible rows (25), so this is headroom, not a target.
 */
export const COMMIT_RUNS_MAX_SHAS = 50;

/**
 * The batched answer: runs keyed by the commit they ran against.
 *
 * A sha main has an answer for — including "no runs" — is present with an
 * array (possibly empty); one it could not answer this time is absent, so the
 * renderer can tell "no CI" from "not asked yet". The `cli` envelope is the
 * same one every forge listing carries; the graph ignores it by design, since
 * a repository with no forge simply draws an empty column.
 */
export const ForgeCommitRunsResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  runs: z.record(z.string(), z.array(ForgeRunSchema)).default({}),
  error: z.string().nullable().default(null),
});
export type ForgeCommitRunsResult = z.infer<typeof ForgeCommitRunsResultSchema>;
