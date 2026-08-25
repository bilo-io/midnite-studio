import { useQuery } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';

/**
 * Commit detail pane — message, per-file counts, and git's own `--stat` block.
 *
 * A stub by design (docs/INITIAL_PLAN.md): a real diff viewer is deferred to
 * post-MVP, and rendering `git show --stat` verbatim is honest about that
 * rather than half-building a diff view.
 */
export function CommitDetail({ repoId, sha }: { repoId: string; sha: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['commit', repoId, sha],
    queryFn: async () => bridge()?.status.commitDetail({ repoId, sha }),
    // A commit is immutable, so this never goes stale.
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (isLoading || !data) {
    return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;
  }

  const insertions = data.files.reduce((sum, f) => sum + f.insertions, 0);
  const deletions = data.files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-3 py-2">
        <p className="font-mono text-xs text-muted-foreground" data-selectable>
          {sha}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm" data-selectable>
          {data.body.trim()}
        </p>
      </header>

      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          {data.files.length} file{data.files.length === 1 ? '' : 's'}
        </span>
        <span className="text-success">+{insertions}</span>
        <span className="text-destructive">−{deletions}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ul className="py-1">
          {data.files.map((file) => (
            <li key={file.path} className="flex items-baseline gap-2 px-3 py-0.5 text-xs">
              <span className="min-w-0 flex-1 truncate" title={file.path} data-selectable>
                {file.path}
              </span>
              <span className="shrink-0 tabular-nums text-success">+{file.insertions}</span>
              <span className="shrink-0 tabular-nums text-destructive">−{file.deletions}</span>
            </li>
          ))}
        </ul>

        {data.stat ? (
          <pre
            className="mt-2 overflow-x-auto border-t border-border px-3 py-2 font-mono text-[11px] leading-tight text-muted-foreground"
            data-selectable
          >
            {data.stat}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
