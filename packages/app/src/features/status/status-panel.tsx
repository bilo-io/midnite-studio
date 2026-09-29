import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useCascadeReveal, useRevealCount } from '../../lib/use-cascade-reveal';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import {
  CommitBox,
  PaneMessage,
  WorkingTreeDiffPane,
  WorkingTreeFileList,
  useWorkingTreeChanges,
} from './working-tree-changes';

/**
 * The changes panel: staged/unstaged lists, a commit box, and the diff pane.
 *
 * A path can appear in BOTH lists — git's porcelain-v2 tracks index-vs-HEAD and
 * worktree-vs-index independently, so a file staged and then edited again is
 * genuinely in two states at once. Showing it once would force a lie about
 * which one; showing it twice is what actually happened.
 *
 * The parts are `working-tree-changes.tsx`'s, shared with the git graph's
 * inline working-copy panel — this component is only their arrangement: the
 * list with the commit box under it on the left, a draggable splitter, and
 * the diff on the right.
 */
export function StatusPanel() {
  const model = useWorkingTreeChanges();
  const activeView = useUiStore((s) => s.activeView);
  const visible = activeView === 'changes';
  const revealCount = useRevealCount(visible);
  const cascade = useCascadeReveal({ revealKey: `${model.repoId}:${revealCount}` });
  const listWidth = useUiStore((s) => s.layout.changesListWidth);
  const setLayout = useUiStore((s) => s.setLayout);

  const list = useResizable({
    size: listWidth,
    onSize: (value) => setLayout('changesListWidth', value),
    initial: DEFAULT_LAYOUT.changesListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.changesListWidth,
  });

  if (!model.repoId || !model.status) {
    return <PaneMessage>Select a repository to see its changes.</PaneMessage>;
  }

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`flex shrink-0 flex-col border-r border-border ${
          list.dragging ? '' : 'transition-[width] duration-150 ease-in-out'
        }`}
        style={{ width: list.current }}
      >
        <WorkingTreeFileList
          model={model}
          cascading={cascade.active}
          cascadeStyleFor={cascade.styleFor}
        />
        {/*
          Always registered, as it always was: a kept-alive or detached copy of
          this view is still where Mod+Enter commits when nothing above it on
          the handle stack (the graph's inline panel) is on screen.
        */}
        <CommitBox model={model} active className="border-t border-border" />
      </div>
      <ResizeHandle resizable={list} axis="x" label="Resize file list" />

      <div className="min-w-0 flex-1">
        <WorkingTreeDiffPane model={model} />
      </div>
    </div>
  );
}
