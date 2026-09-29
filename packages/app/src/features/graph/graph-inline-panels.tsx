import { LuX } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { CommitDetail } from '../commit/commit-detail';
import {
  CommitBox,
  PaneMessage,
  WorkingTreeDiffPane,
  WorkingTreeFileList,
  useWorkingTreeChanges,
} from '../status/working-tree-changes';

/**
 * What the graph's inline slot shows — a commit's inspector, or the working
 * copy. Both are the same split: a left column of details over the file list,
 * and the whole right column for the diff.
 */

/** A commit, expanded under its row — the inspector in its `split` layout. */
export function CommitInlinePanel({
  repoId,
  sha,
  onClose,
}: {
  repoId: string;
  sha: string;
  onClose: () => void;
}) {
  return <CommitDetail repoId={repoId} sha={sha} onClose={onClose} layout="split" />;
}

/**
 * The working copy, expanded under the uncommitted-changes row: the Changes
 * view's own parts (`working-tree-changes.tsx`) rearranged — the commit box
 * on top of the left column, where the commit's message sits in the commit
 * panel beside it, the Staged/Changes lists under it, the diff on the right.
 *
 * With nothing picked the diff side is every changed file, collapsed: a panel
 * opened from the graph is asked "what is in the working copy" before it is
 * asked about any one file.
 *
 * @param active whether the graph is the view on screen — only then does the
 *   commit box take Mod+Enter (see `commit-box-store.ts`).
 */
export function WorkingTreeInlinePanel({
  active,
  onClose,
}: {
  active: boolean;
  /** Absent where there is nothing to collapse back to — an unborn repo's first commit. */
  onClose?: () => void;
}) {
  const model = useWorkingTreeChanges();
  const listWidth = useUiStore((s) => s.layout.graphInlineListWidth);
  const setLayout = useUiStore((s) => s.setLayout);
  const listColumn = useResizable({
    size: listWidth,
    onSize: (value) => setLayout('graphInlineListWidth', value),
    initial: DEFAULT_LAYOUT.graphInlineListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.graphInlineListWidth,
  });

  if (!model.repoId || !model.status) {
    return <PaneMessage>Select a repository to see its changes.</PaneMessage>;
  }

  return (
    <div className="flex h-full min-h-0" data-testid="working-tree-inline-panel">
      <div
        className={`flex shrink-0 flex-col border-r border-border ${
          listColumn.dragging ? '' : 'transition-[width] duration-150 ease-in-out'
        }`}
        style={{ width: listColumn.current }}
      >
        <CommitBox model={model} active={active} className="border-b border-border" />
        <WorkingTreeFileList
          model={model}
          trailing={onClose ? <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} /> : undefined}
        />
      </div>
      <ResizeHandle resizable={listColumn} axis="x" label="Resize the working-copy file list" />
      <div className="min-w-0 flex-1">
        <WorkingTreeDiffPane model={model} />
      </div>
    </div>
  );
}
