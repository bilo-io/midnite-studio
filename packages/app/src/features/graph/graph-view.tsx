import { useCallback, useRef, useState } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import { useDialogs } from '../../components/dialog-host';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useRefs } from '../../services/queries';
import { useStatus } from '../../services/use-status';
import { ConflictBanner } from '../status/conflict-banner';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { CommitDetail } from '../commit/commit-detail';
import { GraphDndProvider, type DropEvent } from './graph-dnd';
import { CommitGraphRow } from './graph-row';
import { useGraphStore } from './graph-store';
import { LANE_WIDTH, ROW_HEIGHT } from './graph-svg';
import { useRefsBySha } from './ref-badge';
import { useGraphActions } from './use-graph-actions';
import { useGraphStream } from './use-graph-stream';

/**
 * The commit graph.
 *
 * Virtualized with @tanstack/react-virtual: a large repo is 50 000 rows, and
 * rendering that many DOM nodes is not a rendering problem so much as a memory
 * and layout one — the browser will do it and then scroll at single-digit fps.
 */
export function GraphView() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const selectedSha = useUiStore((s) => s.selectedCommitSha);
  const selectCommit = useUiStore((s) => s.selectCommit);
  const detailWidth = useUiStore((s) => s.layout.detailWidth);
  const setLayout = useUiStore((s) => s.setLayout);

  useGraphStream(repoId);

  const rows = useGraphStore((s) => s.rows);
  const loading = useGraphStore((s) => s.loading);
  const truncated = useGraphStore((s) => s.truncated);
  const error = useGraphStore((s) => s.error);

  const { data: refs = [] } = useRefs(repoId);
  const refsBySha = useRefsBySha(refs);

  const { data: status } = useStatus();
  const currentBranch = status?.branch.head ?? null;
  const dialogs = useDialogs();
  const [opError, setOpError] = useState('');
  const { commitMenu, refMenu, dropMenu, checkoutRef, report } = useGraphActions(setOpError);

  /**
   * A drop opens a menu at the pointer rather than acting.
   *
   * "Merge X into Y" and "Rebase Y onto X" are the same gesture with opposite
   * effects on history; picking one for the user is a decision they cannot see
   * being made.
   */
  const onDrop = useCallback(
    (event: DropEvent) => {
      const at = lastPointer.current;
      dialogs.openMenu(at, dropMenu(event.source, event.target, currentBranch));
    },
    [currentBranch, dialogs, dropMenu],
  );

  const onRowContextMenu = useCallback(
    (event: { clientX: number; clientY: number }, row: (typeof rows)[number]) =>
      dialogs.openMenu(event, commitMenu(row, currentBranch)),
    [commitMenu, currentBranch, dialogs],
  );
  const onRefContextMenu = useCallback(
    (event: { clientX: number; clientY: number }, ref: (typeof refs)[number]) =>
      dialogs.openMenu(event, refMenu(ref, currentBranch)),
    [currentBranch, dialogs, refMenu],
  );
  const onRefActivate = useCallback(
    (ref: (typeof refs)[number]) => {
      // Double-click to check out — but a branch already live in another
      // worktree cannot be, and silently doing nothing would look like a bug.
      if (ref.worktreePath !== null && ref.name !== currentBranch) {
        setOpError(`"${ref.name}" is checked out in another worktree.`);
        return;
      }
      void checkoutRef.mutateAsync({ target: ref.name }).then(report);
    },
    [checkoutRef, currentBranch, report],
  );

  // Docked to the window's right edge, so its splitter is on its LEFT and a
  // leftward drag has to grow it.
  const detail = useResizable({
    size: detailWidth,
    onSize: (value) => setLayout('detailWidth', value),
    initial: DEFAULT_LAYOUT.detailWidth,
    axis: 'x',
    edge: 'end',
    ...LAYOUT_BOUNDS.detailWidth,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  // dnd-kit's drag-end event carries no pointer position, and the drop menu has
  // to appear where the user released.
  const lastPointer = useRef({ clientX: 0, clientY: 0 });
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // Every row is exactly ROW_HEIGHT, so measurement is pure overhead.
    overscan: 24,
  });

  /**
   * One gutter width for the whole list, not per row.
   *
   * A per-row width would make the subject column jog left and right as the
   * graph narrows and widens while you scroll, which is far more distracting
   * than a little empty space. Capped because a pathological history should not
   * push the subjects off screen.
   */
  const gutterLanes = Math.min(
    12,
    rows.reduce((max, row) => Math.max(max, row.laneCount), 1),
  );

  if (!repoId) {
    return <EmptyState title="No repository selected" body="Pick one from the sidebar." />;
  }

  if (error) {
    return <EmptyState title="Could not read the history" body={error} />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={loading ? 'Reading history…' : 'No commits yet'}
        body={loading ? '' : 'This repository has no commits.'}
      />
    );
  }

  return (
    <GraphDndProvider onDrop={onDrop}>
      <div
        className="flex h-full min-h-0"
        onPointerMove={(event) => {
          lastPointer.current = { clientX: event.clientX, clientY: event.clientY };
        }}
      >
      <div className="flex min-w-0 flex-1 flex-col">
        {status ? <ConflictBanner status={status} onError={setOpError} /> : null}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" role="grid">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div
                  key={row.commit.sha}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <CommitGraphRow
                    row={row}
                    refs={refsBySha.get(row.commit.sha) ?? EMPTY_REFS}
                    selected={selectedSha === row.commit.sha}
                    gutterLanes={gutterLanes}
                    onSelect={selectCommit}
                    onContextMenu={onRowContextMenu}
                    onRefContextMenu={onRefContextMenu}
                    onRefActivate={onRefActivate}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {opError ? (
          <p className="shrink-0 border-t border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {opError}
          </p>
        ) : null}

        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{rows.length.toLocaleString()} commits</span>
          {loading ? <span>loading…</span> : null}
          {truncated ? <span>history truncated at the row cap</span> : null}
          <span className="ml-auto tabular-nums">{gutterLanes * LANE_WIDTH}px gutter</span>
        </footer>
      </div>

      {selectedSha ? (
        <>
          <ResizeHandle resizable={detail} axis="x" label="Resize commit detail" />
          <aside
            className={`shrink-0 border-l border-border ${
              detail.dragging ? '' : 'transition-[width] duration-150 ease-in-out'
            }`}
            style={{ width: detail.current }}
          >
            <CommitDetail repoId={repoId} sha={selectedSha} />
          </aside>
        </>
      ) : null}
      </div>
    </GraphDndProvider>
  );
}

const EMPTY_REFS: never[] = [];

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
    </div>
  );
}
