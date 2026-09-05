import { z } from 'zod';

import type { ForgeRun } from './forge';

/**
 * The red/amber/green reading of a set of CI runs — no `unknown` arm, unlike
 * the branch-health level it feeds in the renderer
 * (`packages/app/src/features/repos/branch-health.ts`'s `HealthLevel`). A
 * verdict is only ever produced when there is something to say; the "nothing
 * to say" case is `undefined`, not a fourth colour.
 */
export const ChecksVerdictLevelSchema = z.enum(['ok', 'warn', 'fail']);
export type ChecksVerdictLevel = z.infer<typeof ChecksVerdictLevelSchema>;

export const ChecksVerdictSchema = z.object({
  level: ChecksVerdictLevelSchema,
  /** e.g. "3 of 3 checks passed" — the provider's own wording. */
  summary: z.string(),
});
export type ChecksVerdict = z.infer<typeof ChecksVerdictSchema>;

const plural = (count: number, word: string): string => (count === 1 ? word : `${word}s`);

/**
 * The last GitHub Actions conclusion for a commit, from its workflow runs.
 *
 * Lifted here from `packages/app/src/features/repos/checks-verdict.ts` (Phase
 * 57 Decision 12): it is pure — only `ForgeRun`, already a `shared` export —
 * so it has one implementation rather than a renderer copy and a main-process
 * copy that can quietly disagree. The renderer's `checks-verdict.ts` re-exports
 * this function; `forge.checks` (the MCP tool) calls it directly, since main
 * may not import anything under `packages/app`.
 *
 * Matched on SHA, never on branch name — a run carries the commit it ran
 * against, and reporting a green tick for a run that tested a since-superseded
 * commit is worse than reporting nothing.
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
    // Every run finished, none passed and none failed — entirely skipped,
    // cancelled or neutral. Not a green light and not a red one.
    return undefined;
  }

  return {
    level: 'ok',
    summary: `${passed.length} of ${latest.length} ${plural(latest.length, 'check')} passed`,
  };
}
