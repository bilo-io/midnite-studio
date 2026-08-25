import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { bridge } from '../../services/bridge';
import { DiffView } from '../diff/diff-view';
import { useCommitFileDiff } from '../diff/use-file-diff';

/**
 * Commit detail pane — message, per-file counts, and the diff of whichever file
 * is selected.
 *
 * Phase 12 Theme D replaced the `git show --stat` block that used to sit at the
 * bottom of this pane: it repeated, as preformatted text, the very numbers the
 * file list above it already showed. Clicking a file now yields its actual diff,
 * which is what the space was always meant to be for.
 *
 * The message body is still plain text — markdown and reference linkification
 * are Theme A.
 */
export function CommitDetail({ repoId, sha }: { repoId: string; sha: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['commit', repoId, sha],
    queryFn: async () => bridge()?.status.commitDetail({ repoId, sha }),
    // A commit is immutable, so this never goes stale.
    staleTime: Number.POSITIVE_INFINITY,
  });

  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Selecting a commit must not carry the previous commit's file selection —
  // the path may not even exist in this one, which would render a permanently
  // empty diff pane with no clue as to why.
  useEffect(() => {
    setSelectedPath(null);
  }, [sha]);

  const diff = useCommitFileDiff({ repoId, sha, path: selectedPath });

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

      <div className="min-h-0 shrink-0 overflow-auto" style={{ maxHeight: '40%' }}>
        <ul className="py-1">
          {data.files.map((file) => {
            const selected = file.path === selectedPath;
            return (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => setSelectedPath(selected ? null : file.path)}
                  aria-pressed={selected}
                  className={`flex w-full items-baseline gap-2 px-3 py-0.5 text-left text-xs ${
                    selected ? 'bg-accent' : 'hover:bg-accent/40'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate" title={file.path}>
                    {file.path}
                  </span>
                  <span className="shrink-0 tabular-nums text-success">+{file.insertions}</span>
                  <span className="shrink-0 tabular-nums text-destructive">−{file.deletions}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="min-h-0 flex-1 border-t border-border">
        {selectedPath === null ? (
          <p className="p-3 text-xs text-muted-foreground">
            Select a file to see what changed in it.
          </p>
        ) : (
          <DiffView
            diff={diff.diff}
            isLoading={diff.isLoading}
            onExpandContext={diff.expandContext}
          />
        )}
      </div>
    </div>
  );
}
