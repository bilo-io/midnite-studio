import { useEffect, useMemo, useRef, useState } from 'react';

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
import { ChangeTotals, ChangeTree, Counts } from '../../components/change-tree';
import { IconButton, type IconComponent } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import {
  useActiveWorktree,
  useCommit,
  useDiscard,
  useStage,
  useStatus,
  useStatusCounts,
  useUnstage,
} from '../../services/use-status';
import {
  DEFAULT_LAYOUT,
  LAYOUT_BOUNDS,
  useUiStore,
  type CommitFileView,
} from '../../store/ui-store';
import { TreeSection } from '../../components/tree-section';
import { useCommitBoxStore, type CommitBoxHandle } from '../../store/commit-box-store';
import { useStashPush } from '../stash/use-stash-actions';
import { ChangesAccordion } from '../changes/changes-accordion';
import { FileDiff } from './file-diff';
import { StashPushDialog, type StashPushRequest } from './stash-push-dialog';
import { StatusMark } from './status-mark';

/** Cap on the commit message textarea's autogrow, past which it scrolls. */
const COMMIT_TEXTAREA_MAX_HEIGHT = 160;

/**
 * The changes panel: staged/unstaged lists, a commit box, and the sync bar.
 *
 * A path can appear in BOTH lists — git's porcelain-v2 tracks index-vs-HEAD and
 * worktree-vs-index independently, so a file staged and then edited again is
 * genuinely in two states at once. Showing it once would force a lie about
 * which one; showing it twice is what actually happened.
 *
 * The lists are the commit inspector's `ChangeTree`, so the tree ⇄ list choice,
 * the roll-up sums on a collapsed directory and the `+n −n` columns are the same
 * component and not a second implementation of them. What the panel adds is the
 * porcelain status letter in front of each row and the staging buttons behind
 * it — both slots on that component.
 */
export function StatusPanel() {
  const target = useActiveWorktree();
  const repoId = target.repoId;
  const listWidth = useUiStore((s) => s.layout.changesListWidth);
  const setLayout = useUiStore((s) => s.setLayout);
  const fileView = useUiStore((s) => s.changesFileView);
  const setFileView = useUiStore((s) => s.setChangesFileView);
  const { data: status } = useStatus();
  const counts = useStatusCounts(target);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // `origPath` rides along because rename detection needs both sides of the
  // pathspec — without it a renamed file diffs as a brand-new file.
  const [selectedPath, setSelectedPath] = useState<{
    path: string;
    staged: boolean;
    origPath: string | null;
  } | null>(null);
  /** Right pane shows every changed file at once instead of one selection. */
  const [viewingAll, setViewingAll] = useState(false);
  /** Phase 22 Theme E's stash prompt — `paths` absent means the whole worktree. */
  const [stashRequest, setStashRequest] = useState<StashPushRequest | null>(null);
  /*
    Collapsed directories, per side.

    Two sets rather than one keyed by `staged:path`: the same directory can hold
    a staged file and an unstaged one, and collapsing it in the list you are
    staging FROM should not fold away the list you are staging INTO.
  */
  const [collapsed, setCollapsed] = useState<{
    staged: ReadonlySet<string>;
    unstaged: ReadonlySet<string>;
  }>({ staged: EMPTY_SET, unstaged: EMPTY_SET });
  /** Both sections are accordions; each opens independently and starts open. */
  const [sectionOpen, setSectionOpen] = useState({ staged: true, unstaged: true });

  const stage = useStage();
  const unstage = useUnstage();
  const discard = useDiscard();
  const commit = useCommit();
  const stashPush = useStashPush();

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

  const list = useResizable({
    size: listWidth,
    onSize: (value) => setLayout('changesListWidth', value),
    initial: DEFAULT_LAYOUT.changesListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.changesListWidth,
  });

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

  const busy =
    stage.isPending || unstage.isPending || discard.isPending || commit.isPending || stashPush.isPending;

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
   * `commit-box-store.ts`. Registered above the `!repoId || !status` guard,
   * because hooks cannot follow a conditional return; it is harmless to
   * register while empty, since the command that would call it is disabled
   * for exactly the same reason.
   */
  const runRef = useRef<() => void>(() => {});
  runRef.current = () => {
    textareaRef.current?.focus();
    if (canSubmit) void onCommit();
  };
  useEffect(() => {
    const handle: CommitBoxHandle = { run: () => runRef.current() };
    useCommitBoxStore.getState().register(handle);
    return () => useCommitBoxStore.getState().unregister(handle);
  }, []);

  if (!repoId || !status) {
    return <Empty>Select a repository to see its changes.</Empty>;
  }

  const toggleDir = (side: 'staged' | 'unstaged', path: string) =>
    setCollapsed((current) => {
      const next = new Set(current[side]);
      if (!next.delete(path)) next.add(path);
      return { ...current, [side]: next };
    });

  const toggleSection = (side: 'staged' | 'unstaged') =>
    setSectionOpen((current) => ({ ...current, [side]: !current[side] }));

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

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`flex shrink-0 flex-col border-r border-border ${
          list.dragging ? '' : 'transition-[width] duration-150 ease-in-out'
        }`}
        style={{ width: list.current }}
      >
        {status.inProgress ? (
          <p className="shrink-0 border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            A {status.inProgress} is in progress.
          </p>
        ) : null}

        {error ? (
          <p className="shrink-0 border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
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
            aria-pressed={viewingAll}
            className={viewingAll ? 'bg-accent text-foreground' : ''}
            disabled={entries.length === 0}
            disabledReason="No changes to view."
            onClick={() => {
              setSelectedPath(null);
              setViewingAll(true);
            }}
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
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
              selectedPath={selectedPath?.staged ? selectedPath.path : null}
              onSelect={(row) => {
                setViewingAll(false);
                setSelectedPath({ path: row.path, staged: true, origPath: row.oldPath });
              }}
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
              selectedPath={selectedPath && !selectedPath.staged ? selectedPath.path : null}
              onSelect={(row) => {
                setViewingAll(false);
                setSelectedPath({ path: row.path, staged: false, origPath: row.oldPath });
              }}
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
            />
          </TreeSection>

          {entries.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">No changes.</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5 border-t border-border p-2">
          <div className="gradient-border rounded-md">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Commit message"
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
            <button
              type="button"
              onClick={() => void onCommit()}
              disabled={!canSubmit}
              className="w-full rounded-md bg-primary px-2 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
            >
              Commit{' '}
              {staged.length > 0 ? `${staged.length} file${staged.length === 1 ? '' : 's'}` : ''}
            </button>
          ) : null}
        </div>
      </div>
      <ResizeHandle resizable={list} axis="x" label="Resize file list" />

      <div className="min-w-0 flex-1">
        {viewingAll ? (
          <ChangesAccordion
            repoId={repoId}
            worktreePath={target.worktreePath}
            entries={entries}
            counts={counts}
            totals={total}
          />
        ) : selectedPath ? (
          <FileDiff
            repoId={repoId}
            path={selectedPath.path}
            staged={selectedPath.staged}
            oldPath={selectedPath.origPath}
          />
        ) : (
          <Empty>Select a file to see its diff.</Empty>
        )}
      </div>

      {stashRequest ? <StashPushDialog request={stashRequest} onCancel={() => setStashRequest(null)} /> : null}
    </div>
  );
}

/** Neither is ever mutated, so module-level instances avoid a render loop. */
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_ENTRIES: readonly StatusEntry[] = [];

/**
 * One list row: what the tree needs to place and sum it, plus what the panel
 * needs to draw and act on it.
 *
 * The status code is carried explicitly rather than re-derived from `entry`,
 * because which of the two codes applies is the whole difference between the
 * two lists — the same entry is `added` on the staged side and `modified` on
 * the unstaged one.
 */
type ChangeRow = ChangedFile & {
  entry: StatusEntry;
  code: StatusEntry['staged'];
};

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
 * panel — the trie is O(paths) over a list that is tens of entries long, and
 * caching it separately would be a second thing to keep in step with staging.
 */
function ChangeRows({
  testId,
  rows,
  view,
  collapsed,
  onToggleDir,
  selectedPath,
  onSelect,
  busy,
  actionsFor,
  dirActionsFor,
}: {
  testId: string;
  rows: readonly ChangeRow[];
  view: CommitFileView;
  collapsed: ReadonlySet<string>;
  onToggleDir: (path: string) => void;
  selectedPath: string | null;
  onSelect: (row: ChangeRow) => void;
  busy: boolean;
  actionsFor: (row: ChangeRow) => RowAction[];
  /** A bulk action over every file under a directory — folder-level staging. */
  dirActionsFor?: (node: DirNode<ChangeRow>) => RowAction[];
}) {
  const nodes = view === 'tree' ? buildChangeTree(rows) : flattenBySize(rows);

  return (
    <ChangeTree
      testId={testId}
      nodes={nodes}
      selection={{ path: selectedPath, onSelect }}
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
