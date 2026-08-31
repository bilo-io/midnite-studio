import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { useRefs } from '../../services/queries';
import { useStatus } from '../../services/use-status';
import { ConflictBanner } from '../status/conflict-banner';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { CommitDetail } from '../commit/commit-detail';
import { GraphDndProvider, type DropEvent } from './graph-dnd';
import { summariseAuthors } from './author-filter';
import { GraphDefs, avatarClipId } from './graph-defs';
import { GraphHeader, graphColumnVars, useGraphColumns } from './graph-header';
import { CommitGraphRow } from './graph-row';
import { useGraphStore } from './graph-store';
import {
  graphThemeFor,
  gutterWidth,
  laneWidthForGutter,
  minLaneWidth,
} from './graph-themes';
import { useRefsBySha } from './ref-badge';
import { UncommittedRow, hasUncommittedWork } from './uncommitted-row';
import { useGraphActions } from './use-graph-actions';
import { useGraphStream } from './use-graph-stream';
import { useActiveAgentWorktreePaths } from './use-agent-worktrees';

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
  const setActiveView = useUiStore((s) => s.setActiveView);

  const graphRefFilter = useUiStore((s) => s.graphRefFilter);
  const graphAuthorFilter = useUiStore((s) => s.graphAuthorFilter);
  /*
    Derived from the two settings every render, never memoised as a scaled
    theme: `scaleTheme` compounds, so holding its output and re-scaling it would
    shrink the graph a little more on each pass. `graphThemeFor` always starts
    from the base style.
  */
  const theme = graphThemeFor(
    useUiStore((s) => s.graphTheme),
    useUiStore((s) => s.graphDensity),
  );
  useGraphStream(repoId, graphRefFilter);

  const rows = useGraphStore((s) => s.rows);
  const requestId = useGraphStore((s) => s.requestId);
  const loading = useGraphStore((s) => s.loading);
  const truncated = useGraphStore((s) => s.truncated);
  const error = useGraphStore((s) => s.error);

  const { data: refs = [] } = useRefs(repoId);
  const refsBySha = useRefsBySha(refs);

  const { data: status } = useStatus();
  const currentBranch = status?.branch.head ?? null;
  const dialogs = useDialogs();
  const [opError, setOpError] = useState('');
  const { commitMenu, refMenu, dropMenu, checkoutRef, report, syncFor, runSync, syncing } =
    useGraphActions(setOpError);

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

  const activeWorktreePaths = useActiveAgentWorktreePaths();
  const isAgentActive = useCallback(
    (ref: (typeof refs)[number]) => {
      if (ref.worktreePath && activeWorktreePaths.has(ref.worktreePath)) {
        return true;
      }
      return false;
    },
    [activeWorktreePaths],
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

  /**
   * One gutter geometry for the whole list, not one per row.
   *
   * A per-row width would make the subject column jog left and right as the
   * graph narrows and widens while you scroll, which is far more distracting
   * than a little empty space. Capped at 12 lanes because a pathological
   * history should not push the subjects off screen.
   */
  const gutterLanes = Math.min(
    MAX_GUTTER_LANES,
    rows.reduce((max, row) => Math.max(max, row.laneCount), 1),
  );

  /**
   * The gutter is a resizable column, so its bounds are geometry rather than
   * constants — `max` the natural fit of this history in this style, `min` the
   * point past which the lanes stop being separable. Computed before
   * `useGraphColumns` because that hook clamps the persisted width to them.
   */
  const gutterBounds = useMemo(
    () => ({
      min: gutterWidth(theme, minLaneWidth(theme), gutterLanes),
      max: gutterWidth(theme, theme.laneWidth, gutterLanes),
    }),
    [gutterLanes, theme],
  );

  const columns = useGraphColumns(gutterBounds);

  /**
   * The requested width resolved back into lane spacing, then forward into the
   * width that spacing actually paints.
   *
   * Round-tripped rather than used directly so the header, the rows and the
   * drag handle cannot disagree: a requested width that does not divide evenly
   * into lanes paints a pixel or two narrower, and taking the raw drag value
   * for the header would leave the label overhanging the lanes it names.
   */
  const laneWidth = laneWidthForGutter(theme, gutterLanes, columns.graph.current);
  const paintedGutter = gutterWidth(theme, laneWidth, gutterLanes);

  const scrollRef = useRef<HTMLDivElement>(null);
  // dnd-kit's drag-end event carries no pointer position, and the drop menu has
  // to appear where the user released.
  const lastPointer = useRef({ clientX: 0, clientY: 0 });
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => theme.rowHeight,
    // Every row is exactly the theme's row height, so measurement is overhead.
    overscan: 24,
  });

  /**
   * Re-measure when the style changes.
   *
   * `estimateSize` is captured per measurement pass, not read per render, so
   * switching style leaves every row positioned at the OLD height — the list
   * renders overlapping or gappy and only corrects itself if you scroll the
   * whole way through it.
   */
  useEffect(() => {
    virtualizer.measure();
  }, [theme.rowHeight, virtualizer]);

  /**
   * The authors to keep at full strength — everyone else is dimmed. `null`
   * means no filter, so nobody dims.
   *
   * A Set, built once per filter change: a `.includes()` per row would be
   * O(rows x selected) on every render of a 50 000-row list.
   */
  const highlightedEmails = useMemo(
    () => (graphAuthorFilter.length === 0 ? null : new Set(graphAuthorFilter)),
    [graphAuthorFilter],
  );

  const authors = useMemo(() => summariseAuthors(rows), [rows]);

  /**
   * The row HEAD points at, for the working-copy row to sit on top of.
   *
   * `undefined` when HEAD is below the loaded window, which is normal on a
   * large repo mid-stream; the pseudo-row then falls back to lane 0 rather than
   * disappearing, since the changes it reports are real either way.
   */
  const headOid = status?.branch.oid ?? null;
  const headRow = useMemo(
    () => (headOid === null ? undefined : rows.find((row) => row.commit.sha === headOid)),
    [headOid, rows],
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
      <div className="flex min-w-0 flex-1 flex-col" style={graphColumnVars(columns)}>
        {status ? <ConflictBanner status={status} onError={setOpError} /> : null}
        <GraphDefs theme={theme} />
        <GraphHeader
          refs={refs}
          authors={authors}
          gutterWidth={paintedGutter}
          columns={columns}
          theme={theme}
        />
        {/*
          Above the scroller, not inside it.

          The working copy is always the top of history, so it must not scroll
          away from it — and keeping it out of the virtualizer means the list's
          index space is still exactly the commits, rather than every `rows[i]`
          having to subtract one.
        */}
        {hasUncommittedWork(status) ? (
          <UncommittedRow
            status={status}
            theme={theme}
            gutterWidth={paintedGutter}
            laneWidth={laneWidth}
            // HEAD's own row, not the newest one. They are usually the same and
            // conspicuously are not when another branch carries newer commits —
            // and then `rows[0]` draws the working copy in a different branch's
            // colour, on a lane it does not sit on.
            colorIdx={headRow?.colorIdx ?? 0}
            lane={headRow?.lane ?? 0}
            onSelect={() => setActiveView('changes')}
          />
        ) : null}

        {/*
          Keyed on requestId so the list fades in ONCE per stream — on a repo
          switch or a filter change. Cascading the rows themselves would re-fire
          the animation every time the virtualizer recycled one, i.e. on every
          scroll, which strobes.
        */}
        <div
          key={requestId ?? 'empty'}
          ref={scrollRef}
          className="min-h-0 flex-1 animate-fade-in overflow-auto"
          role="grid"
        >
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
                    gutterWidth={paintedGutter}
                    laneWidth={laneWidth}
                    theme={theme}
                    clipId={avatarClipId(theme)}
                    dimmed={
                      highlightedEmails !== null &&
                      !highlightedEmails.has(row.commit.authorEmail.trim().toLowerCase())
                    }
                    onSelect={selectCommit}
                    onContextMenu={onRowContextMenu}
                    onRefContextMenu={onRefContextMenu}
                    onRefActivate={onRefActivate}
                    syncFor={syncFor}
                    onSync={runSync}
                    syncing={syncing}
                    currentBranch={currentBranch}
                    isAgentActive={isAgentActive}
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
          <span className="ml-auto tabular-nums">{Math.round(paintedGutter)}px gutter</span>
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

/**
 * Lanes the gutter will draw before it stops widening.
 *
 * A pathological history — a repo with fifty concurrent branches — would
 * otherwise push the commit subjects off the right edge of the window. Beyond
 * this the deeper lanes are simply not drawn.
 */
const MAX_GUTTER_LANES = 12;

