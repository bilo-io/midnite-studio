import { useCallback, useState } from 'react';
import {
  LuArchiveRestore,
  LuArrowUpFromLine,
  LuGitBranchPlus,
  LuPackage,
  LuTrash2,
  LuX,
} from 'react-icons/lu';

import { buildChangeTree } from '../../components/build-change-tree';
import { ChangeTree } from '../../components/change-tree';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { validateRefName } from '../../components/prompt-dialog';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { TreeSection } from '../../components/tree-section';
import { useStashDetail, useStashes } from '../../services/queries';
import { useNow } from '../../lib/use-now';
import { relativeAge } from '../actions/run-groups';
import { LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { DiffView } from '../diff/diff-view';
import { useStashFileDiff } from '../diff/use-file-diff';
import {
  useTargetedStashApply,
  useTargetedStashBranch,
  useTargetedStashDrop,
  useTargetedStashPop,
} from './use-stash-actions';

import type { GitOpResult, StashDiffFile, StashPart } from '@midnite/studio-shared';

/**
 * The stash inspector (Phase 22 Theme D).
 *
 * Three labelled sub-sections in one file list — tracked, index and
 * untracked — rather than tabs, mirroring how the Changes panel splits
 * staged/unstaged over one scroller instead of switching views. `git stash
 * show -p` only ever answers for the tracked part; this is the surface that
 * makes the other two readable at all.
 */
export function StashInspector({
  repoId,
  selector,
  onClose,
  onError,
}: {
  repoId: string;
  selector: string;
  onClose?: () => void;
  /** Surfaces an Apply/Pop/Branch/Drop failure — the graph's own error banner. */
  onError?: (message: string) => void;
}) {
  const { data: detail, isLoading } = useStashDetail(repoId, selector);
  // Only for the header — the entry's message and age, which `stashDetail`
  // itself does not carry. Already cached by the sidebar's own stash list.
  const { data: stashes } = useStashes(repoId);
  const entry = stashes?.find((s) => s.selector === selector);
  const now = useNow();
  const dialogs = useDialogs();

  // The same mutation hooks the sidebar's `stashMenu` calls into
  // (`use-repo-actions.ts`) — this panel is a second consumer of them, not a
  // second copy of Apply/Pop/Branch/Drop.
  const apply = useTargetedStashApply({ repoId });
  const pop = useTargetedStashPop({ repoId });
  const branch = useTargetedStashBranch({ repoId });
  const drop = useTargetedStashDrop({ repoId });
  const report = useCallback(
    (result: GitOpResult) => {
      if (!result.ok && result.kind === 'error') onError?.(result.message);
    },
    [onError],
  );

  const [state, setState] = useState<InspectorState>({ selector, file: null });
  const stale = state.selector !== selector;
  const selected = stale ? null : state.file;
  if (stale) setState({ selector, file: null });

  const toggleFile = useCallback(
    (part: StashPart, file: { path: string; oldPath: string | null }) => {
      setState((current) => ({
        selector,
        file:
          current.selector === selector &&
          current.file?.part === part &&
          current.file.path === file.path
            ? null
            : { part, path: file.path, oldPath: file.oldPath },
      }));
    },
    [selector],
  );

  const diff = useStashFileDiff({
    repoId,
    selector,
    part: selected?.part ?? 'tracked',
    path: selected?.path ?? null,
    oldPath: selected?.oldPath ?? null,
  });

  const filesHeight = useUiStore((s) => s.layout.commitFilesHeight);
  const setLayout = useUiStore((s) => s.setLayout);
  const files = useResizable({
    size: filesHeight,
    onSize: (value) => setLayout('commitFilesHeight', value),
    min: LAYOUT_BOUNDS.commitFilesHeight.min,
    max: LAYOUT_BOUNDS.commitFilesHeight.max,
    initial: 200,
    axis: 'y',
  });

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;
  }

  // A stale selector — the sidebar's `stash@{n}` shifted or the entry was
  // dropped/popped between the row rendering and this panel reading it.
  if (!detail) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm">Stash not found</p>
          {onClose ? (
            <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} />
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono">{selector}</span> is no longer in this repository.
        </p>
      </div>
    );
  }

  const empty = detail.tracked.length + detail.index.length + detail.untracked.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-1.5 px-3 py-2">
        <LuPackage aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-xs" data-selectable>
          {entry?.message ?? selector}
        </p>
        {entry ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {relativeAge(new Date(entry.authoredAt * 1000).toISOString(), now.getTime())}
          </span>
        ) : null}
        <IconButton
          icon={LuArchiveRestore}
          label="Apply stash"
          size="sm"
          onClick={() => void apply.mutateAsync({ selector }).then(report)}
        />
        <IconButton
          icon={LuArrowUpFromLine}
          label="Pop stash"
          size="sm"
          onClick={() => void pop.mutateAsync({ selector }).then(report)}
        />
        <IconButton
          icon={LuGitBranchPlus}
          label="Create branch from stash…"
          size="sm"
          onClick={() =>
            dialogs.prompt({
              title: 'Create branch from stash',
              label: 'Branch name',
              initialValue: '',
              confirmLabel: 'Create branch',
              validate: validateRefName,
              onConfirm: (name) => void branch.mutateAsync({ name, selector }).then(report),
            })
          }
        />
        <IconButton
          icon={LuTrash2}
          label="Drop stash…"
          size="sm"
          onClick={() =>
            dialogs.confirm({
              title: 'Drop this stash?',
              body: 'The entry is removed. A toast with an Undo action follows immediately after — this is the one stash op that needs it.',
              confirmLabel: 'Drop stash',
              danger: true,
              blastRadius: null,
              onConfirm: () =>
                void drop.mutateAsync({ selector, message: entry?.message ?? selector }).then(report),
            })
          }
        />
        {onClose ? (
          <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} />
        ) : null}
      </header>

      {empty ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">This stash changed no files.</p>
      ) : (
        <>
          <div
            className="min-h-0 shrink-0 overflow-auto"
            style={{ height: files.current, maxHeight: '60%' }}
            data-testid="stash-file-pane"
          >
            <StashPart
              title="Tracked changes"
              part="tracked"
              files={detail.tracked}
              selected={selected}
              onSelect={toggleFile}
            />
            <StashPart
              title="Staged at stash time"
              part="index"
              files={detail.index}
              selected={selected}
              onSelect={toggleFile}
            />
            <StashPart
              title="Untracked files"
              part="untracked"
              files={detail.untracked}
              selected={selected}
              onSelect={toggleFile}
            />
          </div>

          <ResizeHandle resizable={files} axis="y" label="Resize the stash file list" />

          <div className="min-h-0 flex-1">
            {selected === null ? (
              <p className="p-3 text-xs text-muted-foreground">
                Select a file to see what changed in it.
              </p>
            ) : (
              <DiffView diff={diff.diff} isLoading={diff.isLoading} onExpandContext={diff.expandContext} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

type InspectorState = {
  selector: string;
  file: { part: StashPart; path: string; oldPath: string | null } | null;
};

function StashPart({
  title,
  part,
  files,
  selected,
  onSelect,
}: {
  title: string;
  part: StashPart;
  files: readonly StashDiffFile[];
  selected: { part: StashPart; path: string } | null;
  onSelect: (part: StashPart, file: { path: string; oldPath: string | null }) => void;
}) {
  const tree = buildChangeTree(files);

  return (
    <TreeSection title={title} count={files.length}>
      <ChangeTree
        nodes={tree}
        selection={{
          path: selected?.part === part ? selected.path : null,
          onSelect: (file) => onSelect(part, file),
        }}
        collapsed={EMPTY_SET}
        onToggleDir={noop}
        flat
        testId={`stash-files-${part}`}
      />
    </TreeSection>
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const noop = () => {};
