import { DiffView } from '../diff/diff-view';
import { useFileDiff } from '../diff/use-file-diff';

/**
 * Working-tree / index diff pane.
 *
 * A thin wrapper over `<DiffView>` since Phase 12 Theme D: the renderer, the
 * colour treatment and the expansion behaviour are shared with the commit
 * inspector, so there is exactly one place where a deletion's styling is
 * decided.
 */
export function FileDiff({
  repoId,
  path,
  staged,
  oldPath,
}: {
  repoId: string;
  path: string;
  staged: boolean;
  /** `StatusEntry.origPath` — without it a renamed file diffs as wholly new. */
  oldPath?: string | null;
}) {
  const { diff, isLoading, expandContext } = useFileDiff({
    repoId,
    path,
    staged,
    ...(oldPath === undefined ? {} : { oldPath }),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-background px-3 py-1.5 text-xs">
        <span className="font-medium">{path}</span>
        <span className="ml-2 text-muted-foreground">{staged ? 'staged' : 'working tree'}</span>
      </header>
      <div className="min-h-0 flex-1">
        <DiffView
          diff={diff}
          isLoading={isLoading}
          onExpandContext={expandContext}
          emptyMessage={diff ? describeEmpty(diff) : 'No textual diff for this file.'}
        />
      </div>
    </div>
  );
}

/**
 * Why a diff has nothing to show. Mirrors git-engine's `describeEmptyDiff`,
 * which the renderer may not import — `app` never depends on git-engine.
 */
function describeEmpty(diff: {
  binary: boolean;
  oldMode: string | null;
  newMode: string | null;
}): string {
  if (diff.binary) return 'Binary file — no textual diff.';
  if (diff.oldMode && diff.newMode && diff.oldMode !== diff.newMode) {
    return `Mode changed from ${diff.oldMode} to ${diff.newMode}.`;
  }
  return 'No textual diff for this file.';
}
