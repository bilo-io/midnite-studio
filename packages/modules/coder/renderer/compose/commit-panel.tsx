import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LuX } from 'react-icons/lu';

import { bridge, RingSpinner } from '@midnite/studio-frame';
import { DiffToolbar, DiffView, useCommitFileDiff } from '@midnite/studio-frame/diff';

/**
 * A commit, expanded under its row in Coder's graph (the `GitHost.CommitPanel` member): its message,
 * its files and the frame's own diff view for the one picked. Read-only — no revert, cherry-pick or
 * checkout, which in Studio come from the commit inspector's write actions. No image diffs either:
 * those read blobs over Studio's file protocol, which Coder does not register.
 */
export function CoderCommitPanel({ repoId, sha, onClose }: { repoId: string; sha: string; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['repos', repoId, 'commit', sha],
    queryFn: async () => (await bridge()?.status.commitDetail({ repoId, sha })) ?? null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const files = detail.data?.files ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const path = picked ?? files[0]?.path ?? null;
  const file = files.find((f) => f.path === path);
  const { diff, isLoading, expandContext } = useCommitFileDiff({ repoId, sha, path, oldPath: file?.oldPath ?? null });

  if (detail.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RingSpinner label="Loading commit" size="sm" />
      </div>
    );
  }
  if (!detail.data) {
    return <p className="p-3 text-xs text-muted-foreground">This commit could not be read.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="coder-commit-panel">
      <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{detail.data.subject}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {detail.data.author.name} · <span className="font-mono">{sha.slice(0, 7)}</span>
          </p>
        </div>
        <button
          type="button"
          aria-label="Close commit details"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuX aria-hidden className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <ul aria-label="Changed files" className="w-60 shrink-0 overflow-y-auto border-r border-border py-1">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                aria-current={f.path === path ? 'true' : undefined}
                onClick={() => setPicked(f.path)}
                title={f.path}
                className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs ${f.path === path ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
              >
                <span className="min-w-0 flex-1 truncate">{f.path}</span>
                <span className="shrink-0 tabular-nums text-success">+{f.insertions}</span>
                <span className="shrink-0 tabular-nums text-destructive">−{f.deletions}</span>
              </button>
            </li>
          ))}
          {files.length === 0 ? <li className="px-3 py-1 text-xs text-muted-foreground">No files changed.</li> : null}
        </ul>
        <div className="flex min-w-0 flex-1 flex-col">
          {diff ? <DiffToolbar diff={diff} onExpandContext={expandContext} /> : null}
          <div className="min-h-0 flex-1">
            <DiffView diff={diff} isLoading={isLoading} onExpandContext={expandContext} />
          </div>
        </div>
      </div>
    </div>
  );
}
