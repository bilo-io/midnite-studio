import { useMemo, useState } from 'react';

import type { Ref, RepoDescriptor, Worktree } from '@midnite/git-shared';
import {
  ChevronRight,
  Cloud,
  FolderCheck,
  FolderGit2,
  FolderPlus,
  FolderX,
  GitBranch,
  Tag,
  X,
} from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { Tooltip } from '../../components/tooltip';
import { TreeSection } from '../../components/tree-section';
import { cascadeStyle } from '../../lib/cascade';
import {
  useCloseRepo,
  usePickAndOpenRepo,
  useRefs,
  useRemoveWorktree,
  useRepos,
} from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

/**
 * The repositories sidebar, modelled on VS Code's SCM view crossed with
 * GitKraken's ref tree.
 *
 * Each repository owns four labelled subsections — Local, Remotes, Tags,
 * Worktrees — because "which ref" and "which checkout" are different questions
 * and the app answers both. Every one of them folds independently: a repo with
 * two hundred tags and three worktrees is unusable if the tags cannot be got
 * out of the way. A linked worktree is nested under the repository
 * that owns it, never listed as a sibling: git treats every checkout as a
 * worktree, including the main one, so the list is uniform with the primary
 * checkout marked rather than special-cased.
 *
 * Selecting a worktree, not just a repo, is the point of the panel: staging,
 * committing and status are all per-checkout, so "which worktree" is the app's
 * primary context.
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
        <IconButton
          icon={FolderPlus}
          label="Open a repository…"
          size="sm"
          disabled={isPending}
          onClick={() => void onOpen()}
        />
      </header>

      {error ? (
        <p className="mx-3 mb-2 animate-fade-in rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
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
          repos.map((repo, index) => (
            <RepoItem key={repo.id} repo={repo} first={index === 0} index={index} />
          ))
        )}
      </div>
    </div>
  );
}

function RepoItem({
  repo,
  first,
  index,
}: {
  repo: RepoDescriptor;
  first: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const close = useCloseRepo();
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const selectRepo = useUiStore((s) => s.selectRepo);

  /**
   * Refs are fetched per repo, but only while it is expanded.
   *
   * `useRefs` runs one `for-each-ref` over heads, remotes and tags; doing that
   * eagerly for every open repository would cost a subprocess per repo on every
   * watcher invalidation, to populate a tree nobody has opened.
   */
  const { data: refs = [] } = useRefs(expanded ? repo.id : null);

  return (
    <section
      style={cascadeStyle(index)}
      className={`animate-fade-in-up cascade-delay ${
        // A delimiter between repositories, not above the first one — a rule at
        // the top of a list reads as a header separator that lost its header.
        //
        // No padding around the rule: the repo row and the tree below it carry
        // their own, and adding more here left the selected row's highlight
        // floating a few pixels clear of the delimiter above it.
        first ? '' : 'border-t border-border/60'
      }`}
    >
      <div
        className={`group flex items-center gap-1 px-2 py-1 text-sm transition-colors ${
          selectedRepoId === repo.id ? 'bg-accent/60' : 'hover:bg-accent/30'
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground"
          aria-label={expanded ? `Collapse ${repo.name}` : `Expand ${repo.name}`}
          aria-expanded={expanded}
        >
          <ChevronRight
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform duration-150 ease-in-out ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </button>

        <Tooltip label={repo.path}>
          <button
            type="button"
            onClick={() => selectRepo(repo.id)}
            className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
          >
            <span className="truncate font-medium">{repo.name}</span>
            <span className="shrink-0 truncate text-xs text-muted-foreground">
              {repo.headRef ?? 'detached'}
            </span>
          </button>
        </Tooltip>

        <IconButton
          icon={X}
          label={`Close ${repo.name}`}
          size="sm"
          tone="danger"
          onClick={() => close.mutate(repo.id)}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>

      {expanded ? <RepoTree repo={repo} refs={refs} /> : null}
    </section>
  );
}

/** Beyond this a tag list stops being a list and becomes a wall. */
const TAG_PREVIEW = 50;

type SectionKey = 'local' | 'remotes' | 'tags' | 'worktrees';

/**
 * Fold state for a repo's subsections.
 *
 * Held as the set of *closed* sections so a section defaults to open without
 * having to be listed — a repo the user just opened should show its tree, and
 * a section they folded away should stay folded while the repo stays expanded.
 */
function useSectionToggles() {
  const [closed, setClosed] = useState<ReadonlySet<SectionKey>>(() => new Set());

  return (key: SectionKey) => ({
    collapsible: true,
    open: !closed.has(key),
    onToggle: () =>
      setClosed((prev) => {
        const next = new Set(prev);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
  });
}

function RepoTree({ repo, refs }: { repo: RepoDescriptor; refs: Ref[] }) {
  const [showAllTags, setShowAllTags] = useState(false);
  const section = useSectionToggles();

  const { branches, remotes, tags } = useMemo(() => partitionRefs(refs), [refs]);

  // The main worktree is listed alongside the linked ones: git models it as a
  // worktree too, so the list is uniform with the primary checkout flagged.
  const worktrees = useMemo(
    () => [...repo.worktrees].sort((a, b) => Number(b.isMain) - Number(a.isMain)),
    [repo.worktrees],
  );

  const visibleTags = showAllTags ? tags : tags.slice(0, TAG_PREVIEW);

  return (
    <div className="pb-1">
      {/*
        "Local", not "Branches": the section below it is remote branches too,
        and a heading that only says "Branches" leaves the reader to work out
        which of the two they are looking at.
      */}
      <TreeSection title="Local" count={branches.length} depth={1} {...section('local')}>
        {branches.map((ref, i) => (
          <RefRow key={ref.fullName} refItem={ref} icon={GitBranch} index={i} />
        ))}
      </TreeSection>

      <TreeSection title="Remotes" count={remotes.length} depth={1} {...section('remotes')}>
        {remotes.map((group) => (
          <RemoteGroup key={group.name} name={group.name} refs={group.refs} />
        ))}
      </TreeSection>

      <TreeSection
        title="Tags"
        count={tags.length}
        depth={1}
        {...section('tags')}
        action={
          tags.length > TAG_PREVIEW
            ? {
                label: showAllTags ? 'Show fewer' : `Show all ${tags.length}`,
                onClick: () => setShowAllTags((v) => !v),
              }
            : undefined
        }
      >
        {visibleTags.map((ref, i) => (
          <RefRow key={ref.fullName} refItem={ref} icon={Tag} index={i} />
        ))}
      </TreeSection>

      <TreeSection title="Worktrees" count={worktrees.length} depth={1} {...section('worktrees')}>
        {worktrees.map((worktree, i) => (
          <WorktreeRow key={worktree.id} repo={repo} worktree={worktree} index={i} />
        ))}
      </TreeSection>
    </div>
  );
}

function RemoteGroup({ name, refs }: { name: string; refs: Ref[] }) {
  const [open, setOpen] = useState(true);
  return (
    <TreeSection
      title={name}
      count={refs.length}
      icon={<Cloud aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
      collapsible
      open={open}
      onToggle={() => setOpen((v) => !v)}
      depth={2}
    >
      {refs.map((ref, i) => (
        <RefRow key={ref.fullName} refItem={ref} icon={GitBranch} index={i} depth={2} />
      ))}
    </TreeSection>
  );
}

/**
 * One ref row — a branch, a remote branch, or a tag.
 *
 * Read-only by design: checkout, delete and rename all live on the graph's ref
 * badges behind a context menu with the blast-radius gating Phase 7 built. A
 * second, subtly different set of destructive affordances over here would be a
 * place for the two to disagree.
 */
function RefRow({
  refItem,
  icon: Icon,
  index,
  depth = 1,
}: {
  refItem: Ref;
  icon: typeof GitBranch;
  index: number;
  depth?: number;
}) {
  const ahead = refItem.upstream?.ahead ?? 0;
  const behind = refItem.upstream?.behind ?? 0;

  // Checked out somewhere else: git refuses to check the same branch out twice,
  // so the row says why rather than looking merely inert.
  const elsewhere = refItem.worktreePath !== null && !refItem.isHead;

  const row = (
    <div
      style={cascadeStyle(index)}
      className={`flex animate-fade-in-up cascade-delay items-center gap-1.5 py-0.5 pr-2 text-[13px] transition-colors hover:bg-accent/30 ${
        depth === 2 ? 'pl-12' : 'pl-8'
      } ${elsewhere ? 'text-muted-foreground' : ''}`}
    >
      <Icon aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{shortName(refItem)}</span>
      {refItem.isHead ? (
        <span
          aria-label="current branch"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
        />
      ) : null}
      {refItem.upstream?.gone ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-destructive">gone</span>
      ) : null}
      {ahead > 0 || behind > 0 ? (
        <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
          {ahead > 0 ? `↑${ahead}` : ''}
          {behind > 0 ? `↓${behind}` : ''}
        </span>
      ) : null}
    </div>
  );

  return elsewhere ? (
    <Tooltip label={`Checked out in ${refItem.worktreePath}`}>{row}</Tooltip>
  ) : (
    row
  );
}

function WorktreeRow({
  repo,
  worktree,
  index,
}: {
  repo: RepoDescriptor;
  worktree: Worktree;
  index: number;
}) {
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

  /**
   * A folder glyph, deliberately unlike the branch's `GitBranch`.
   *
   * A worktree is a directory on disk that happens to have a branch checked
   * out; a branch is a line of history. They were both `⑂` before, which made
   * the two halves of the tree read as one repeated list.
   */
  const Icon = worktree.prunable ? FolderX : worktree.isMain ? FolderCheck : FolderGit2;

  return (
    <div
      style={cascadeStyle(index)}
      className={`group flex animate-fade-in-up cascade-delay items-center gap-1.5 py-0.5 pl-8 pr-2 text-[13px] transition-colors ${
        active ? 'bg-accent/60' : 'hover:bg-accent/30'
      }`}
    >
      <Tooltip label={worktree.path}>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <Icon
            aria-hidden
            className={`h-3 w-3 shrink-0 ${
              worktree.prunable ? 'text-destructive' : 'text-muted-foreground'
            }`}
          />
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
      </Tooltip>

      {/*
        The main worktree cannot be removed — `git worktree remove` refuses, and
        offering the action would only ever produce an error.
      */}
      {worktree.isMain ? null : pendingRemove ? (
        <span className="flex shrink-0 animate-fade-in items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => {
              // Never `--force`: git's refusal to remove a worktree with
              // uncommitted changes is the last thing between a stray click and
              // lost work. The error surfaces instead.
              remove.mutate({ path: worktree.path, force: false });
              setPendingRemove(false);
            }}
            className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive transition-colors"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => setPendingRemove(false)}
            className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors"
          >
            Cancel
          </button>
        </span>
      ) : (
        <IconButton
          icon={X}
          label={`Remove worktree ${worktree.branch ?? worktree.path}`}
          size="sm"
          tone="danger"
          onClick={() => setPendingRemove(true)}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      )}
    </div>
  );
}

/** `origin/feat/x` displays as `feat/x` under its `origin` group. */
const shortName = (ref: Ref): string =>
  ref.kind === 'remoteBranch' ? ref.name.slice(ref.name.indexOf('/') + 1) : ref.name;

/**
 * Split a repo's refs into the tree's three ref sections.
 *
 * Remote branches group by the segment before the first `/` — `origin/main`
 * and `upstream/main` are different branches on different remotes, and a flat
 * list of them is unreadable the moment a second remote exists.
 */
export function partitionRefs(refs: readonly Ref[]): {
  branches: Ref[];
  remotes: { name: string; refs: Ref[] }[];
  tags: Ref[];
} {
  const branches: Ref[] = [];
  const tags: Ref[] = [];
  const byRemote = new Map<string, Ref[]>();

  for (const ref of refs) {
    if (ref.kind === 'localBranch') branches.push(ref);
    else if (ref.kind === 'tag') tags.push(ref);
    else if (ref.kind === 'remoteBranch') {
      const slash = ref.name.indexOf('/');
      // A remote ref with no `/` cannot be attributed to a remote; bucket it
      // under its own name rather than dropping it silently.
      const remote = slash === -1 ? ref.name : ref.name.slice(0, slash);
      const bucket = byRemote.get(remote);
      if (bucket) bucket.push(ref);
      else byRemote.set(remote, [ref]);
    }
  }

  return {
    // HEAD first, then alphabetical — the branch you are on is the one you look
    // for, and it should not move as the list grows.
    branches: branches.sort(
      (a, b) => Number(b.isHead) - Number(a.isHead) || a.name.localeCompare(b.name),
    ),
    remotes: [...byRemote.entries()]
      .map(([name, list]) => ({ name, refs: list.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tags: tags.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })),
  };
}
