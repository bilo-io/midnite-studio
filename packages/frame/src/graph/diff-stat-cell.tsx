import type { CommitDiffStat } from '@midnite/studio-shared';

/**
 * One commit's `+added −deleted` for the Diff column.
 *
 * `undefined` is "not loaded yet" and draws nothing; `null` is a merge commit
 * and draws an em dash (a first-parent diff of a merge is the whole side
 * branch, which would read as a huge change the merge itself never made). The
 * file count rides along in the tooltip.
 */
export function DiffStatCell({ stat }: { stat: CommitDiffStat | null | undefined }) {
  if (stat === undefined) return null;
  if (stat === null) {
    return (
      <span className="text-muted-foreground" title="Merge commit — no diff shown">
        —
      </span>
    );
  }
  const title = `${stat.files} ${stat.files === 1 ? 'file' : 'files'} changed`;
  return (
    <span className="flex items-baseline gap-1.5" title={title}>
      <span className="text-emerald-500">+{stat.added}</span>
      <span className="text-red-500">−{stat.deleted}</span>
    </span>
  );
}
