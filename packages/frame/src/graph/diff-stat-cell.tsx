import type { CommitDiffStat } from '@midnite/studio-shared';

/** What a Diff or Diff Chart cell shows before its commit's stat has arrived. */
export function DiffStatPending() {
  return (
    <span className="text-muted-foreground/60" title="Diff stat not loaded yet" data-testid="diff-stat-pending">
      …
    </span>
  );
}

/**
 * One commit's `+added −deleted` for the Diff column — the sum of the per-file
 * numstat the commit inspector lists, a merge measured against its first parent.
 *
 * `undefined` is "not loaded yet" and draws a neutral placeholder: a stat that
 * has not arrived is not a commit that changed nothing, so it never reads as
 * `+0 −0`. The file count rides along in the tooltip.
 */
export function DiffStatCell({ stat }: { stat: CommitDiffStat | undefined }) {
  if (stat === undefined) return <DiffStatPending />;
  const title = `${stat.files} ${stat.files === 1 ? 'file' : 'files'} changed`;
  return (
    <span className="flex items-baseline gap-1.5" title={title}>
      <span className="text-emerald-500">+{stat.added}</span>
      <span className="text-red-500">−{stat.deleted}</span>
    </span>
  );
}
