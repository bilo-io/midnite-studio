import { useState } from 'react';

import type { StatusEntry } from '@midnite/git-shared';

import { Minus, Plus, Undo2 } from 'lucide-react';

import { IconButton, type IconComponent } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useCommit, useDiscard, useStage, useStatus, useUnstage } from '../../services/use-status';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { TreeSection } from '../../components/tree-section';
import { FileDiff } from './file-diff';

/**
 * The changes panel: staged/unstaged lists, a commit box, and the sync bar.
 *
 * A path can appear in BOTH lists — git's porcelain-v2 tracks index-vs-HEAD and
 * worktree-vs-index independently, so a file staged and then edited again is
 * genuinely in two states at once. Showing it once would force a lie about
 * which one; showing it twice is what actually happened.
 */
export function StatusPanel() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const listWidth = useUiStore((s) => s.layout.changesListWidth);
  const setLayout = useUiStore((s) => s.setLayout);
  const { data: status } = useStatus();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedPath, setSelectedPath] = useState<{ path: string; staged: boolean } | null>(null);

  const stage = useStage();
  const unstage = useUnstage();
  const discard = useDiscard();
  const commit = useCommit();

  const list = useResizable({
    size: listWidth,
    onSize: (value) => setLayout('changesListWidth', value),
    initial: DEFAULT_LAYOUT.changesListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.changesListWidth,
  });

  if (!repoId || !status) {
    return <Empty>Select a repository to see its changes.</Empty>;
  }

  const staged = status.entries.filter((e) => e.staged !== 'unmodified');
  const unstaged = status.entries.filter((e) => e.unstaged !== 'unmodified');
  const busy = stage.isPending || unstage.isPending || discard.isPending || commit.isPending;

  const onCommit = async () => {
    const result = await commit.mutateAsync({ message });
    if (result.ok) {
      setMessage('');
      setError('');
    } else {
      setError(result.kind === 'error' ? result.message : 'The commit conflicted.');
    }
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TreeSection
            title="Staged"
            count={staged.length}
            action={staged.length > 0 ? { label: 'Unstage all', onClick: () => unstage.mutate(staged.map((e) => e.path)) } : undefined}
          >
            {staged.map((entry) => (
              <FileRow
                key={`staged-${entry.path}`}
                entry={entry}
                code={entry.staged}
                selected={selectedPath?.path === entry.path && selectedPath.staged}
                busy={busy}
                onSelect={() => setSelectedPath({ path: entry.path, staged: true })}
                actions={[{ icon: Minus, title: 'Unstage', onClick: () => unstage.mutate([entry.path]) }]}
              />
            ))}
          </TreeSection>

          <TreeSection
            title="Changes"
            count={unstaged.length}
            action={unstaged.length > 0 ? { label: 'Stage all', onClick: () => stage.mutate(unstaged.map((e) => e.path)) } : undefined}
          >
            {unstaged.map((entry) => (
              <FileRow
                key={`unstaged-${entry.path}`}
                entry={entry}
                code={entry.unstaged}
                selected={selectedPath?.path === entry.path && !selectedPath.staged}
                busy={busy}
                onSelect={() => setSelectedPath({ path: entry.path, staged: false })}
                actions={[
                  {
                    icon: Undo2,
                    title: 'Discard changes',
                    // Uncommitted work has no reflog — a mistake here cannot be
                    // undone, so it asks first, every time.
                    confirm: `Discard changes to ${entry.path}? This cannot be undone.`,
                    onClick: () => discard.mutate([entry.path]),
                    // Untracked files aren't touched by `restore`, and deleting
                    // them is a different, more dangerous operation.
                    hidden: entry.unstaged === 'untracked',
                  },
                  { icon: Plus, title: 'Stage', onClick: () => stage.mutate([entry.path]) },
                ]}
              />
            ))}
          </TreeSection>

          {status.entries.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">No changes.</p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border p-2">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Commit message"
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => void onCommit()}
            disabled={busy || message.trim().length === 0 || staged.length === 0}
            className="mt-1.5 w-full rounded-md bg-primary px-2 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Commit {staged.length > 0 ? `${staged.length} file${staged.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>
      <ResizeHandle resizable={list} axis="x" label="Resize file list" />

      <div className="min-w-0 flex-1">
        {selectedPath ? (
          <FileDiff repoId={repoId} path={selectedPath.path} staged={selectedPath.staged} />
        ) : (
          <Empty>Select a file to see its diff.</Empty>
        )}
      </div>
    </div>
  );
}

type RowAction = {
  icon: IconComponent;
  /** Accessible name, tooltip, and React key — one string, so they cannot drift. */
  title: string;
  onClick: () => void;
  confirm?: string;
  hidden?: boolean;
};

function FileRow({
  entry,
  code,
  selected,
  busy,
  onSelect,
  actions,
}: {
  entry: StatusEntry;
  code: StatusEntry['staged'];
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  actions: RowAction[];
}) {
  return (
    <div
      className={`group flex items-center gap-2 py-0.5 pl-3 pr-2 text-sm ${
        selected ? 'bg-accent/70' : 'hover:bg-accent/30'
      }`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-baseline gap-2 text-left">
        <StatusMark code={code} conflicted={entry.conflicted} />
        <span className="truncate" title={entry.origPath ? `${entry.origPath} → ${entry.path}` : entry.path}>
          {entry.path}
        </span>
      </button>

      {actions
        .filter((action) => !action.hidden)
        .map((action) => (
          <IconButton
            key={action.title}
            icon={action.icon}
            label={`${action.title} ${entry.path}`}
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
    </div>
  );
}

const MARKS: Record<string, { char: string; className: string }> = {
  modified: { char: 'M', className: 'text-amber-500' },
  added: { char: 'A', className: 'text-success' },
  deleted: { char: 'D', className: 'text-destructive' },
  renamed: { char: 'R', className: 'text-primary' },
  copied: { char: 'C', className: 'text-primary' },
  untracked: { char: 'U', className: 'text-muted-foreground' },
  ignored: { char: 'I', className: 'text-muted-foreground' },
  typeChanged: { char: 'T', className: 'text-amber-500' },
  conflicted: { char: '!', className: 'text-destructive' },
};

function StatusMark({ code, conflicted }: { code: string; conflicted: boolean }) {
  const mark = MARKS[conflicted ? 'conflicted' : code] ?? MARKS['modified']!;
  return (
    <span className={`w-3 shrink-0 text-center font-mono text-xs ${mark.className}`} aria-hidden>
      {mark.char}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
