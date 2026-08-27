import { useActiveWorktree } from '../../services/use-status';
import { DiffView } from '../diff/diff-view';
import { imageDiffSources } from '../diff/image-sources';
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
  worktreePath,
}: {
  repoId: string;
  path: string;
  staged: boolean;
  /** The checkout this path belongs to, when it is not the selected one. */
  worktreePath?: string | undefined;
  /** `StatusEntry.origPath` — without it a renamed file diffs as wholly new. */
  oldPath?: string | null;
}) {
  /*
    The same active-worktree fallback `useFileDiff` applies internally, made
    explicit here because the image URLs need it too. Left implicit, a diff of
    a linked worktree would be paired with the MAIN checkout's image — the diff
    right, the picture from somewhere else.
  */
  const active = useActiveWorktree();
  const checkout = worktreePath ?? active.worktreePath;

  const { diff, isLoading, expandContext } = useFileDiff({
    repoId,
    path,
    staged,
    ...(oldPath === undefined ? {} : { oldPath }),
    ...(checkout === undefined ? {} : { worktreePath: checkout }),
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
          images={imageDiffSources(diff, {
            kind: 'worktree',
            repoId,
            staged,
            ...(checkout === undefined ? {} : { worktreePath: checkout }),
          })}
        />
      </div>
    </div>
  );
}
