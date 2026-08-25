import { useState } from 'react';

import type { RepoDescriptor, Worktree } from '@midnite/git-shared';

import {
  useCloseRepo,
  usePickAndOpenRepo,
  useRemoveWorktree,
  useRepos,
} from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

/**
 * The repositories sidebar, modelled on VS Code's SCM view.
 *
 * The shape that matters: a linked worktree is nested *under* the repository
 * that owns it, never listed as a sibling. Git treats every checkout as a
 * worktree — including the main one — so the list is uniform, with the primary
 * checkout marked rather than special-cased.
 *
 * Selecting a worktree, not just a repo, is the point of the panel: staging,
 * committing and status are all per-checkout, so "which worktree" is the
 * app's primary context.
 */
export function ReposPanel() {
  const { data: repos = [], isLoading } = useRepos();
  const { pickAndOpen, isPending } = usePickAndOpenRepo();
  const [error, setError] = useState<string | null>(null);

  const onOpen = async () => {
    setError(null);
    const result = await pickAndOpen();
    if (result && !result.ok) setError(result.message);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-card/40">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Repositories
        </h2>
        <button
          type="button"
          onClick={() => void onOpen()}
          disabled={isPending}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Open a repository…"
        >
          + Open
        </button>
      </header>

      {error ? (
        <p className="mx-3 mb-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {isLoading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
        ) : repos.length === 0 ? (
          <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            No repositories yet. <span className="text-foreground">Open</span> one to get started —
            a linked worktree works too, and nests under the repository that owns it.
          </p>
        ) : (
          repos.map((repo) => <RepoItem key={repo.id} repo={repo} />)
        )}
      </div>
    </div>
  );
}

function RepoItem({ repo }: { repo: RepoDescriptor }) {
  const [expanded, setExpanded] = useState(true);
  const close = useCloseRepo();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectRepo = useUiStore((s) => s.selectRepo);

  // Only linked worktrees nest; the main one IS the repository row.
  const linked = repo.worktrees.filter((w) => !w.isMain);
  const main = repo.worktrees.find((w) => w.isMain);

  return (
    <section className="mb-0.5">
      <div
        className={`group flex items-center gap-1 px-2 py-1 text-sm ${
          selectedRepoId === repo.id ? 'bg-accent/60' : 'hover:bg-accent/30'
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-4 shrink-0 text-xs text-muted-foreground"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
          // No chevron when there is nothing to expand — an affordance that
          // does nothing is worse than none.
          disabled={linked.length === 0}
        >
          {linked.length === 0 ? '' : expanded ? '▾' : '▸'}
        </button>

        <button
          type="button"
          onClick={() => selectRepo(repo.id)}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
          title={repo.path}
        >
          <span className="truncate font-medium">{repo.name}</span>
          <span className="shrink-0 truncate text-xs text-muted-foreground">
            {repo.headRef ?? 'detached'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => close.mutate(repo.id)}
          className="shrink-0 rounded px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          title="Close repository"
          aria-label={`Close ${repo.name}`}
        >
          ✕
        </button>
      </div>

      {expanded && main ? <WorktreeRow repo={repo} worktree={main} /> : null}
      {expanded ? linked.map((w) => <WorktreeRow key={w.id} repo={repo} worktree={w} />) : null}
    </section>
  );
}

function WorktreeRow({ repo, worktree }: { repo: RepoDescriptor; worktree: Worktree }) {
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectRepo = useUiStore((s) => s.selectRepo);
  const selectWorktree = useUiStore((s) => s.selectWorktree);
  const remove = useRemoveWorktree(repo.id);
  const [pendingRemove, setPendingRemove] = useState(false);

  const active = selectedRepoId === repo.id && selectedWorktreePath === worktree.path;

  const onSelect = () => {
    if (selectedRepoId !== repo.id) selectRepo(repo.id);
    selectWorktree(worktree.path);
  };

  return (
    <div
      className={`group flex items-center gap-2 py-1 pl-7 pr-2 text-sm ${
        active ? 'bg-accent/60' : 'hover:bg-accent/30'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
        title={worktree.path}
      >
        <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
          {worktree.isMain ? '●' : '⑂'}
        </span>
        <span className="truncate">{worktree.branch ?? 'detached'}</span>
        {worktree.isMain ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            main
          </span>
        ) : null}
        {worktree.prunable ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-destructive">
            missing
          </span>
        ) : null}
        {worktree.locked ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            locked
          </span>
        ) : null}
      </button>

      {/*
        The main worktree cannot be removed — `git worktree remove` refuses, and
        offering the action would only ever produce an error.
      */}
      {worktree.isMain ? null : pendingRemove ? (
        <span className="flex shrink-0 items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => {
              // Never `--force`: git's refusal to remove a worktree with
              // uncommitted changes is the last thing between a stray click and
              // lost work. The error surfaces instead.
              remove.mutate({ path: worktree.path, force: false });
              setPendingRemove(false);
            }}
            className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => setPendingRemove(false)}
            className="rounded px-1.5 py-0.5 text-muted-foreground"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setPendingRemove(true)}
          className="shrink-0 rounded px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          title="Remove worktree"
          aria-label={`Remove worktree ${worktree.branch ?? worktree.path}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}
