import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import type { StatusEntry } from '@midnite/studio-shared';

import { LuList, LuListTree, LuMinus, LuPackage, LuPlus, LuUndo2 } from 'react-icons/lu';
import { AiOutlineDiff } from 'react-icons/ai';

import {
  buildChangeTree,
  collectFilePaths,
  flattenBySize,
  type ChangedFile,
  type DirNode,
} from '../../components/build-change-tree';
import { ChangeTotals, ChangeTree, Counts, type FileSelectModifiers } from '../../components/change-tree';
import { IconButton, type IconComponent } from '../../components/icon-button';
import { TreeSection } from '../../components/tree-section';
import {
  useActiveWorktree,
  useCommit,
  useDiscard,
  useStage,
  useStatus,
  useStatusCounts,
  useUnstage,
} from '../../services/use-status';
import { useUiStore, type CommitFileView } from '../../store/ui-store';
import { draftKey, useCommitBoxStore, type CommitBoxHandle } from '../../store/commit-box-store';
import { useStashPush } from '../stash/use-stash-actions';
import { ChangesAccordion } from '../changes/changes-accordion';
import { FileDiff } from './file-diff';
import { StashPushDialog, type StashPushRequest } from './stash-push-dialog';
import { StatusMark } from './status-mark';

/**
 * The working tree's change list, commit box and diff pane, as parts.
 *
 * Lifted out of the old standalone Changes view's `StatusPanel`, which is
 * gone: the git graph's inline working-copy panel
 * (`graph/graph-inline-panels.tsx`) is now their one host, and owns only the
 * ARRANGEMENT — commit box on top, list under it, diff on the right. They
 * stay here beside the rest of the working-tree status parts.
 *
 * One hook, {@link useWorkingTreeChanges}, holds everything the parts share —
 * the rows, the selection, the collapse state, the staging mutations — so a
 * part never re-derives what another part already knows.
 */

/** Cap on the commit message textarea's autogrow, past which it scrolls. */
const COMMIT_TEXTAREA_MAX_HEIGHT = 160;

/** One selected file, on one side of the index. */
export type WorkingTreeSelectionItem = {
  path: string;
  staged: boolean;
  /** Rename detection needs both sides of the pathspec, so the pre-image rides along. */
  origPath: string | null;
};

/**
 * One list row: what the tree needs to place and sum it, plus what the panel
 * needs to draw and act on it.
 *
 * The status code is carried explicitly rather than re-derived from `entry`,
 * because which of the two codes applies is the whole difference between the
 * two lists — the same entry is `added` on the staged side and `modified` on
 * the unstaged one.
 */
export type ChangeRow = ChangedFile & {
  entry: StatusEntry;
  code: StatusEntry['staged'];
};

type Side = 'staged' | 'unstaged';

const itemKey = (item: { path: string; staged: boolean }): string =>
  `${item.staged ? 's' : 'u'}\u0000${item.path}`;

/**
 * Everything the working-tree parts share.
 *
 * With no file picked the diff pane shows every changed file (collapsed): a
 * panel opened from the graph is asked "what is in the working copy" before
 * it is asked about any one file.
 */
export function useWorkingTreeChanges() {
  const target = useActiveWorktree();
  const repoId = target.repoId;
  const fileView = useUiStore((s) => s.changesFileView);
  const setFileView = useUiStore((s) => s.setChangesFileView);
  const { data: status } = useStatus();
  const counts = useStatusCounts(target);

  const [selection, setSelection] = useState<readonly WorkingTreeSelectionItem[]>(EMPTY_ITEMS);
  /** The diff pane shows every changed file at once instead of the selection. */
  const [viewingAll, setViewingAll] = useState(false);
  /** Phase 22 Theme E's stash prompt — `paths` absent means the whole worktree. */
  const [stashRequest, setStashRequest] = useState<StashPushRequest | null>(null);
  /*
    Collapsed directories, per side.

    Two sets rather than one keyed by `staged:path`: the same directory can hold
    a staged file and an unstaged one, and collapsing it in the list you are
    staging FROM should not fold away the list you are staging INTO.
  */
  const [collapsed, setCollapsed] = useState<Record<Side, ReadonlySet<string>>>({
    staged: EMPTY_SET,
    unstaged: EMPTY_SET,
  });
  /** Both sections are accordions; each opens independently and starts open. */
  const [sectionOpen, setSectionOpen] = useState<Record<Side, boolean>>({
    staged: true,
    unstaged: true,
  });

  const stage = useStage();
  const unstage = useUnstage();
  const discard = useDiscard();
  const commit = useCommit();
  const stashPush = useStashPush();

  const entries = status?.entries ?? EMPTY_ENTRIES;
  const staged = useMemo(
    () =>
      entries
        .filter((e) => e.staged !== 'unmodified')
        .map((entry) => toChangeRow(entry, entry.staged, counts.staged(entry.path))),
    [entries, counts],
  );
  const unstaged = useMemo(
    () =>
      entries
        .filter((e) => e.unstaged !== 'unmodified')
        .map((entry) => toChangeRow(entry, entry.unstaged, counts.unstaged(entry.path))),
    [entries, counts],
  );

  /*
    The selection as it stands against the CURRENT lists: staging a selected
    file moves it to the other side, and committing takes it away entirely —
    a diff pane still pointed at either would render an empty diff with no
    clue why. Pruned on read rather than in an effect, so no render ever
    shows the stale one.
  */
  const liveSelection = useMemo(() => {
    const present = new Set([
      ...staged.map((row) => itemKey({ path: row.path, staged: true })),
      ...unstaged.map((row) => itemKey({ path: row.path, staged: false })),
    ]);
    const kept = selection.filter((item) => present.has(itemKey(item)));
    return kept.length === selection.length ? selection : kept;
  }, [selection, staged, unstaged]);

  const selectRow = useCallback(
    (row: ChangeRow, side: Side, modifiers: FileSelectModifiers) => {
      const item = { path: row.path, staged: side === 'staged', origPath: row.oldPath };
      setViewingAll(false);
      setSelection((current) => {
        if (!modifiers.additive) return [item];
        const key = itemKey(item);
        return current.some((existing) => itemKey(existing) === key)
          ? current.filter((existing) => itemKey(existing) !== key)
          : [...current, item];
      });
    },
    [],
  );

  const viewAll = useCallback(() => {
    setSelection(EMPTY_ITEMS);
    setViewingAll(true);
  }, []);

  const toggleDir = useCallback(
    (side: Side, path: string) =>
      setCollapsed((current) => {
        const next = new Set(current[side]);
        if (!next.delete(path)) next.add(path);
        return { ...current, [side]: next };
      }),
    [],
  );

  const toggleSection = useCallback(
    (side: Side) => setSectionOpen((current) => ({ ...current, [side]: !current[side] })),
    [],
  );

  /** Opens the stash prompt scoped to `paths` — omitted addresses the whole worktree. */
  const openStashDialog = (paths?: string[]) => {
    setStashRequest({
      paths,
      onConfirm: (args) => {
        setStashRequest(null);
        stashPush.mutate({ ...args, paths });
      },
    });
  };

  const busy =
    stage.isPending || unstage.isPending || discard.isPending || commit.isPending || stashPush.isPending;

  /*
    One roll-up over BOTH lists, deduplicated by path.

    A partially staged file is two rows and one file — summing the rows would
    report 25 changed files where `git status` says 24, and the number directly
    above a list that disagrees with it is worse than no number. The line counts
    do add up across the two sides, because a staged hunk and an unstaged hunk
    in the same file are genuinely different lines.
  */
  const total = {
    fileCount: new Set(entries.map((entry) => entry.path)).size,
    insertions: sum(staged, 'insertions') + sum(unstaged, 'insertions'),
    deletions: sum(staged, 'deletions') + sum(unstaged, 'deletions'),
  };

  const showingAll = viewingAll || liveSelection.length === 0;

  return {
    target,
    repoId,
    status,
    counts,
    entries,
    staged,
    unstaged,
    total,
    busy,
    stage,
    unstage,
    discard,
    commit,
    stashPush,
    fileView,
    setFileView,
    selection: liveSelection,
    selectRow,
    viewAll,
    showingAll,
    collapsed,
    toggleDir,
    sectionOpen,
    toggleSection,
    stashRequest,
    openStashDialog,
    closeStashDialog: () => setStashRequest(null),
  };
}

export type WorkingTreeChanges = ReturnType<typeof useWorkingTreeChanges>;

/**
 * The two sections — Staged and Changes — under a one-line header carrying the
 * whole checkout's totals, "view all changes", stash and the tree ⇄ list
 * toggle. `trailing` lands at the end of that header (the graph panel's close
 * button).
 */
export function WorkingTreeFileList({
  model,
  cascading = false,
  cascadeStyleFor,
  trailing,
}: {
  model: WorkingTreeChanges;
  cascading?: boolean;
  cascadeStyleFor?: (index: number) => CSSProperties;
  trailing?: ReactNode;
}) {
  const {
    status,
    entries,
    staged,
    unstaged,
    total,
    busy,
    stage,
    unstage,
    discard,
    stashPush,
    fileView,
    setFileView,
    selection,
    selectRow,
    viewAll,
    showingAll,
    collapsed,
    toggleDir,
    sectionOpen,
    toggleSection,
    stashRequest,
    openStashDialog,
    closeStashDialog,
  } = model;

  const selectedOn = (side: Side) =>
    new Set(selection.filter((item) => item.staged === (side === 'staged')).map((item) => item.path));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {status?.inProgress ? (
        <p className="shrink-0 border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          A {status.inProgress} is in progress.
        </p>
      ) : null}

      {/*
        The whole checkout in one line, above both sections. The per-section
        headings count their own rows; this is the answer to "how big is what
        I am about to commit" without adding two numbers together.
      */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border py-1 pl-3 pr-2">
        <ChangeTotals {...total} />
        <IconButton
          icon={AiOutlineDiff}
          label="View all changes"
          size="sm"
          aria-pressed={showingAll}
          className={showingAll ? 'bg-accent text-foreground' : ''}
          disabled={entries.length === 0}
          disabledReason="No changes to view."
          onClick={viewAll}
        />
        <IconButton
          icon={LuPackage}
          label="Stash changes"
          size="sm"
          disabled={entries.length === 0}
          disabledReason="No changes to stash."
          busy={stashPush.isPending}
          onClick={() => openStashDialog()}
        />
        <ViewToggle view={fileView} onChange={setFileView} />
        {trailing}
      </div>

      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
        <TreeSection
          title="Staged"
          count={staged.length}
          meta={<Counts {...linesOf(staged)} />}
          collapsible
          open={sectionOpen.staged}
          onToggle={() => toggleSection('staged')}
          action={
            staged.length > 0
              ? { label: 'Unstage all', onClick: () => unstage.mutate(staged.map((e) => e.path)) }
              : undefined
          }
        >
          <ChangeRows
            testId="changes-staged"
            rows={staged}
            view={fileView}
            collapsed={collapsed.staged}
            onToggleDir={(path) => toggleDir('staged', path)}
            selectedPaths={selectedOn('staged')}
            onSelect={(row, modifiers) => selectRow(row, 'staged', modifiers)}
            busy={busy}
            actionsFor={(row) => [
              { icon: LuMinus, title: 'Unstage', onClick: () => unstage.mutate([row.path]) },
            ]}
            dirActionsFor={(node) => [
              {
                icon: LuMinus,
                title: 'Unstage folder',
                onClick: () => unstage.mutate(collectFilePaths(node)),
              },
            ]}
            cascading={cascading}
            cascadeStyleFor={cascadeStyleFor}
          />
        </TreeSection>

        <TreeSection
          title="Changes"
          count={unstaged.length}
          meta={<Counts {...linesOf(unstaged)} />}
          collapsible
          open={sectionOpen.unstaged}
          onToggle={() => toggleSection('unstaged')}
          action={
            unstaged.length > 0
              ? { label: 'Stage all', onClick: () => stage.mutate(unstaged.map((e) => e.path)) }
              : undefined
          }
        >
          <ChangeRows
            testId="changes-unstaged"
            rows={unstaged}
            view={fileView}
            collapsed={collapsed.unstaged}
            onToggleDir={(path) => toggleDir('unstaged', path)}
            selectedPaths={selectedOn('unstaged')}
            onSelect={(row, modifiers) => selectRow(row, 'unstaged', modifiers)}
            busy={busy}
            actionsFor={(row) => [
              {
                icon: LuUndo2,
                title: 'Discard changes',
                // Uncommitted work has no reflog — a mistake here cannot be
                // undone, so it asks first, every time.
                confirm: `Discard changes to ${row.path}? This cannot be undone.`,
                onClick: () => discard.mutate([row.path]),
                // Untracked files aren't touched by `restore`, and deleting
                // them is a different, more dangerous operation.
                hidden: row.code === 'untracked',
              },
              { icon: LuPlus, title: 'Stage', onClick: () => stage.mutate([row.path]) },
              { icon: LuPackage, title: 'Stash file', onClick: () => openStashDialog([row.path]) },
            ]}
            cascading={cascading}
            cascadeStyleFor={cascadeStyleFor ? (i) => cascadeStyleFor(staged.length + i) : undefined}
          />
        </TreeSection>

        {entries.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No changes.</p>
        ) : null}
      </div>

      {stashRequest ? <StashPushDialog request={stashRequest} onCancel={closeStashDialog} /> : null}
    </div>
  );
}

/**
 * The commit message and its button.
 *
 * The draft lives in `commit-box-store`, keyed by checkout, so it survives the
 * graph panel collapsing and is the same words in both hosts. `active` says
 * whether this box should hold the `status.commit` (Mod+Enter) handle — the
 * store stacks handles, and the topmost is the one the shortcut calls.
 *
 * **Escape blurs the textarea and stops there.** The graph panel collapses on
 * Escape, and a keypress that threw away the panel — and with it the diff the
 * message was being written against — while the user was mid-sentence would be
 * the wrong reading of it. So the first Escape only hands focus back; the next
 * one is the panel's.
 */
export function CommitBox({
  model,
  active,
  className = '',
}: {
  model: WorkingTreeChanges;
  active: boolean;
  className?: string;
}) {
  const { repoId, target, staged, busy, commit } = model;
  const key = repoId ? draftKey(repoId, target.worktreePath) : null;
  const message = useCommitBoxStore((s) => (key ? (s.drafts[key] ?? '') : ''));
  const setDraft = useCommitBoxStore((s) => s.setDraft);
  const setMessage = (value: string) => {
    if (key) setDraft(key, value);
  };
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const onCommit = async () => {
    const result = await commit.mutateAsync({ message });
    if (result.ok) {
      setMessage('');
      setError('');
    } else {
      setError(result.kind === 'error' ? result.message : 'The commit conflicted.');
    }
  };

  const canSubmit = !busy && message.trim().length > 0 && staged.length > 0;

  /**
   * Autogrow: starts at one line-height and expands with content up to
   * `COMMIT_TEXTAREA_MAX_HEIGHT`, past which it scrolls. Re-measures on every
   * `message` change, so it also collapses back to one line once `onCommit`
   * clears the message.
   */
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, COMMIT_TEXTAREA_MAX_HEIGHT)}px`;
  }, [message]);

  /**
   * The seam `status.commit` (Mod+Enter) calls through — see
   * `commit-box-store.ts`. The ref keeps the handle stable while what it does
   * follows every render.
   */
  const runRef = useRef<() => void>(() => {});
  runRef.current = () => {
    textareaRef.current?.focus();
    if (canSubmit) void onCommit();
  };
  useEffect(() => {
    if (!active) return;
    const handle: CommitBoxHandle = { run: () => runRef.current() };
    useCommitBoxStore.getState().register(handle);
    return () => useCommitBoxStore.getState().unregister(handle);
  }, [active]);

  if (!repoId) return null;

  return (
    <div className={`flex shrink-0 flex-col gap-1.5 p-2 ${className}`}>
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="gradient-border rounded-md">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            // See the component note: the first Escape is the field's.
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.blur();
          }}
          placeholder="Commit message"
          aria-label="Commit message"
          rows={1}
          /*
            `block`: a `<textarea>` is inline-block by default, so without
            it the `gradient-border` wrapper — a plain block `<div>` — sized
            itself to the inline FORMATTING CONTEXT's line box rather than
            to the textarea's own border box, leaving a ~6px descender gap
            under it that only showed up as an asymmetric inset (bottom vs.
            top) once the auto-grow effect started setting an exact pixel
            height on the textarea.
          */
          className="block w-full resize-none overflow-y-auto rounded-md border-0 bg-background px-2 py-1.5 text-sm outline-none"
        />
      </div>
      {message.length > 0 ? (
        /*
          The brand-gradient primary button (`.brand-gradient-button` in
          `styles.css`): the full ramp as its fill, and a blurred copy of the
          same gradient as its hover/focus glow. Disabled (nothing staged)
          drops the glow and desaturates the fill; the label stays readable.
        */
        <button
          type="button"
          onClick={() => void onCommit()}
          disabled={!canSubmit}
          data-testid="commit-button"
          className="brand-gradient-button w-full rounded-md px-2 py-1.5 text-sm font-semibold"
        >
          Commit{' '}
          {staged.length > 0 ? `${staged.length} file${staged.length === 1 ? '' : 's'}` : ''}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The diff side: one file's diff, several files' diffs, or every file's.
 *
 * - nothing picked: the whole checkout as a collapsed accordion;
 * - one file: that file's full diff, on the side it was picked from;
 * - several (Cmd/Ctrl-click): an accordion of just those, already open —
 *   picking them was asking to read them.
 */
export function WorkingTreeDiffPane({ model }: { model: WorkingTreeChanges }) {
  const { repoId, target, entries, counts, total, selection, showingAll } = model;

  const picked = useMemo(() => {
    const paths = new Set(selection.map((item) => item.path));
    return entries.filter((entry) => paths.has(entry.path));
  }, [entries, selection]);

  if (!repoId) return null;

  if (showingAll) {
    return (
      <ChangesAccordion
        repoId={repoId}
        worktreePath={target.worktreePath}
        entries={entries}
        counts={counts}
        totals={total}
      />
    );
  }

  if (selection.length === 1) {
    const [only] = selection;
    return (
      <FileDiff
        repoId={repoId}
        path={only!.path}
        staged={only!.staged}
        oldPath={only!.origPath}
      />
    );
  }

  if (selection.length > 1) {
    return (
      <ChangesAccordion
        // Re-keyed on the selection so a changed pick re-opens every file in it.
        key={selection.map(itemKey).join('\u0001')}
        repoId={repoId}
        worktreePath={target.worktreePath}
        entries={picked}
        counts={counts}
        totals={{
          fileCount: picked.length,
          insertions: picked.reduce((n, e) => n + countsOf(counts, e).insertions, 0),
          deletions: picked.reduce((n, e) => n + countsOf(counts, e).deletions, 0),
        }}
        initiallyExpanded
      />
    );
  }

  return <PaneMessage>Select a file to see its diff.</PaneMessage>;
}

/** The counts a picked file's accordion row shows — the side its diff comes from. */
const countsOf = (counts: WorkingTreeChanges['counts'], entry: StatusEntry) =>
  entry.unstaged === 'unmodified' ? counts.staged(entry.path) : counts.unstaged(entry.path);

/** Neither is ever mutated, so module-level instances avoid a render loop. */
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_ENTRIES: readonly StatusEntry[] = [];
const EMPTY_ITEMS: readonly WorkingTreeSelectionItem[] = [];

function toChangeRow(
  entry: StatusEntry,
  code: StatusEntry['staged'],
  counts: { insertions: number; deletions: number },
): ChangeRow {
  return {
    path: entry.path,
    oldPath: entry.origPath,
    insertions: counts.insertions,
    deletions: counts.deletions,
    entry,
    code,
  };
}

const sum = (rows: readonly ChangeRow[], field: 'insertions' | 'deletions'): number =>
  rows.reduce((total, row) => total + row[field], 0);

/** One side's line totals. No file count — the section heading already has it. */
const linesOf = (rows: readonly ChangeRow[]) => ({
  insertions: sum(rows, 'insertions'),
  deletions: sum(rows, 'deletions'),
});

type RowAction = {
  icon: IconComponent;
  /** Accessible name, tooltip, and React key — one string, so they cannot drift. */
  title: string;
  onClick: () => void;
  confirm?: string;
  hidden?: boolean;
};

/**
 * One side's rows, as a tree or a flat list.
 *
 * The tree is rebuilt per render from `rows`, which is already memoised by the
 * hook — the trie is O(paths) over a list that is tens of entries long, and
 * caching it separately would be a second thing to keep in step with staging.
 */
function ChangeRows({
  testId,
  rows,
  view,
  collapsed,
  onToggleDir,
  selectedPaths,
  onSelect,
  busy,
  actionsFor,
  dirActionsFor,
  cascading,
  cascadeStyleFor,
}: {
  testId: string;
  rows: readonly ChangeRow[];
  view: CommitFileView;
  collapsed: ReadonlySet<string>;
  onToggleDir: (path: string) => void;
  selectedPaths: ReadonlySet<string>;
  onSelect: (row: ChangeRow, modifiers: FileSelectModifiers) => void;
  busy: boolean;
  actionsFor: (row: ChangeRow) => RowAction[];
  /** A bulk action over every file under a directory — folder-level staging. */
  dirActionsFor?: (node: DirNode<ChangeRow>) => RowAction[];
  cascading?: boolean;
  cascadeStyleFor?: ((index: number) => CSSProperties) | undefined;
}) {
  const nodes = view === 'tree' ? buildChangeTree(rows) : flattenBySize(rows);

  return (
    <ChangeTree
      testId={testId}
      nodes={nodes}
      selection={{ path: null, paths: selectedPaths, onSelect }}
      collapsed={view === 'tree' ? collapsed : EMPTY_SET}
      onToggleDir={onToggleDir}
      flat={view === 'list'}
      renderLeading={(node) => <StatusMark code={node.code} conflicted={node.entry.conflicted} />}
      renderActions={(node) => (
        <RowActions actions={actionsFor(node)} path={node.path} busy={busy} />
      )}
      renderDirActions={
        dirActionsFor
          ? (node) => <RowActions actions={dirActionsFor(node)} path={node.path} busy={busy} />
          : undefined
      }
      cascading={cascading}
      cascadeStyleFor={cascadeStyleFor}
    />
  );
}

function RowActions({
  actions,
  path,
  busy,
}: {
  actions: RowAction[];
  path: string;
  busy: boolean;
}) {
  return (
    <>
      {actions
        .filter((action) => !action.hidden)
        .map((action) => (
          <IconButton
            key={action.title}
            icon={action.icon}
            label={`${action.title} ${path}`}
            size="sm"
            tone={action.confirm ? 'danger' : 'ghost'}
            disabled={busy}
            onClick={() => {
              // A native confirm is the right weight for a per-file discard;
              // the blast-radius dialog is for history-rewriting operations,
              // where the number of orphaned commits is the actual decision.
              if (action.confirm && !window.confirm(action.confirm)) return;
              action.onClick();
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          />
        ))}
    </>
  );
}

/** Tree ⇄ list, the same two-button radio group the commit inspector uses. */
function ViewToggle({
  view,
  onChange,
}: {
  view: CommitFileView;
  onChange: (view: CommitFileView) => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <IconButton
        icon={LuListTree}
        label="Group the changed files by folder"
        size="sm"
        aria-pressed={view === 'tree'}
        className={view === 'tree' ? 'bg-accent text-foreground' : ''}
        onClick={() => onChange('tree')}
      />
      <IconButton
        icon={LuList}
        label="List the changed files by how much changed"
        size="sm"
        aria-pressed={view === 'list'}
        className={view === 'list' ? 'bg-accent text-foreground' : ''}
        onClick={() => onChange('list')}
      />
    </div>
  );
}

export function PaneMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
