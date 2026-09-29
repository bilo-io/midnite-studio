import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';
import { LuGitBranch, LuGitCommitVertical, LuUsers } from 'react-icons/lu';

import { type ClosedSession, type CommitCi, type CommitProvenance } from '@midnite/studio-shared';
import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useDismiss } from '../../components/use-dismiss';
import { useResizable } from '../../components/resizable/use-resizable';
import { evictKeptViewIfOverRows } from '../../components/view-keep-alive';
import { useRefs, useSessionHistory, useStashes } from '../../services/queries';
import { useStatus } from '../../services/use-status';
import { ConflictBanner } from '../status/conflict-banner';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { ConflictResolutionStudio } from '../conflicts/conflict-resolution-studio';
import { StashInspector } from '../stash/stash-inspector';
import { StashRows } from './stash-rows';
import { GraphDndProvider, type DropEvent } from './graph-dnd';
import { summariseAuthors } from './author-filter';
import { countLocalBranches } from './branch-count';
import { firstCommitDate } from './first-commit-date';
import { GraphDefs, avatarClipId } from './graph-defs';
import { GraphHeader, graphColumnVars, useGraphColumns } from './graph-header';
import { CommitGraphRow, formatDate, RECENCY_WINDOW_MS } from './graph-row';
import { formatNumber } from '../../lib/format-number';
import { useCascadeReveal, useRevealCount } from '../../lib/use-cascade-reveal';
import { useWindowFocusGate } from '../../lib/use-window-focus-gate';
import { useGraphStore } from './graph-store';
import {
  graphThemeFor,
  gutterWidth,
  laneWidthForGutter,
  minLaneWidth,
} from './graph-themes';
import { CiRunModal } from './ci-run-modal';
import { useRefsBySha } from './ref-badge';
import { UncommittedRow, hasUncommittedWork } from './uncommitted-row';
import { CommitInlinePanel, WorkingTreeInlinePanel } from './graph-inline-panels';
import { InlineExpander, InlineSlot, SLOT_INSET, lanesLeaving } from './inline-expansion';
import { isReducedMotion } from '../../lib/reduced-motion';
import { useEditableFocus } from '../../lib/use-editable-focus';
import { useGraphActions } from './use-graph-actions';
import { useGraphStream } from './use-graph-stream';
import { useCommitCi } from './use-commit-ci';
import { useActiveAgentWorktreePaths, useActiveAgentWorktreeSessions } from './use-agent-worktrees';
import { useAgents } from '../terminal/use-agents';
import { provenanceMarkMode as provenanceMarkModeOf } from './provenance-display';
import { resolveProvenanceDetails } from './provenance-mark';
import { matchesProvenanceFilter } from './provenance-filter';

/**
 * The commit graph.
 *
 * Virtualized with @tanstack/react-virtual: a large repo is 50 000 rows, and
 * rendering that many DOM nodes is not a rendering problem so much as a memory
 * and layout one — the browser will do it and then scroll at single-digit fps.
 */
export function GraphView() {
  const repoId = useUiStore((s) => s.selectedRepoId);
  // Whether THIS mount is the one currently on screen, rather than a Theme G
  // kept-alive hidden copy left over from switching away — the graph opts
  // into `keepAlive` in `view-registry.tsx`, so this same component instance
  // can go on existing, unmounted, after the user has moved to another view.
  const activeView = useUiStore((s) => s.activeView);
  const visible = activeView === 'graph';
  useWindowFocusGate(visible);
  const selectedWorktreePath = useUiStore((s) => s.selectedWorktreePath);
  const graphSelection = useUiStore((s) => s.graphSelection);
  const selectedSha = graphSelection?.kind === 'commit' ? graphSelection.sha : null;
  const selectCommit = useUiStore((s) => s.selectCommit);
  const selectWorkingTree = useUiStore((s) => s.selectWorkingTree);
  const workingTreeOpen = graphSelection?.kind === 'working-tree';
  const selectStash = useUiStore((s) => s.selectStash);
  const selectConflict = useUiStore((s) => s.selectConflict);
  const detailWidth = useUiStore((s) => s.layout.detailWidth);
  const setLayout = useUiStore((s) => s.setLayout);

  const graphRefFilter = useUiStore((s) => s.graphRefFilter);
  const graphAuthorFilter = useUiStore((s) => s.graphAuthorFilter);
  const graphShaFilter = useUiStore((s) => s.graphShaFilter);
  const graphProvenanceFilter = useUiStore((s) => s.graphProvenanceFilter);
  // Coerced rather than read raw, exactly as `graphTheme` is: a mode persisted
  // by a future build falls back to the default instead of rendering nothing.
  const provenanceMarkMode = provenanceMarkModeOf(useUiStore((s) => s.graphProvenanceMark));
  const showCi = useUiStore((s) => s.graphShowCi);

  const { agents } = useAgents();
  const { data: closedSessions } = useSessionHistory();
  const sessions = closedSessions ?? EMPTY_SESSIONS;

  const rosterSignatures = useMemo(
    () => agents.flatMap((a) => (a.signatures ? [a.signatures] : [])),
    [agents],
  );

  useEffect(() => {
    useGraphStore.getState().setProvenanceContext({
      roster: rosterSignatures,
      sessions,
    });
  }, [rosterSignatures, sessions]);

  const provenance = useGraphStore((s) => s.provenance);

  const matchingAgents = useMemo(() => {
    const activeAgentIds = new Set<string>();
    for (const p of Object.values(provenance)) {
      if (p.kind !== 'human') {
        for (const id of p.agentIds) {
          activeAgentIds.add(id);
        }
      }
    }
    return agents.filter((a) => activeAgentIds.has(a.id));
  }, [agents, provenance]);
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
  useGraphStream(repoId, graphRefFilter, undefined, visible);

  /*
    Esc deselects whichever the graph currently has open, commit or stash —
    `selectCommit(null)` clears `graphSelection` outright regardless of its
    current `kind`, so one call covers both without branching on it.

    On the shared dismissal stack (Phase 62) at the bottom layer, so a context
    menu raised from a selected row takes Escape and the selection SURVIVES.
    Both listeners used to be on `window`, so one keypress closed the menu and
    threw away the selection the user had spent a click getting to.

    Passive, unlike every other blocking surface: a selected row is long-lived
    application state rather than an overlay, and `blocking` also registers an
    occluder — which would blank a live browser tab's native `WebContentsView`
    (`use-browser-bounds.ts`) for as long as a commit stayed selected beside it.
    Nothing here ever paints over that view, so nothing here should hide it.
  */
  /*
    Two more conditions since the details moved inline (the graph's own
    expand-in-place panels):

    - `visible` — a kept-alive graph behind another view must not spend that
      view's Escape collapsing a panel nobody can see;
    - `!editing` — Escape typed into a field, the terminal or a Monaco editor
      belongs to that field. The stack consumes every Escape it is handed, so
      the only way to leave one to a focused field is not to be registered
      while it has focus (`lib/use-editable-focus.ts`). The commit box's own
      Escape blurs it, which un-registers nothing and re-arms this one, so a
      second Escape then collapses the panel.
  */
  const editing = useEditableFocus();
  useDismiss(visible && graphSelection !== null && !editing, () => selectCommit(null), {
    layer: 'inline',
    blocking: false,
  });

  /**
   * A click on a commit row opens its details under it; a click on the row
   * already open closes them again. Read from the store at click time, so the
   * callback is stable and the memoised rows never re-render for it.
   */
  const toggleCommit = useCallback((sha: string) => {
    const { graphSelection: current, selectCommit: select } = useUiStore.getState();
    select(current?.kind === 'commit' && current.sha === sha ? null : sha);
  }, []);

  // `rows` is a stable buffer the store mutates in place for the life of a
  // stream (see graph-store.ts), so `rowCount` — not the array's own identity
  // — is what changes on every batch and is what re-renders this component.
  const rowCount = useGraphStore((s) => s.rows.length);
  const rows = useGraphStore.getState().rows;
  const requestId = useGraphStore((s) => s.requestId);
  const loading = useGraphStore((s) => s.loading);
  const truncated = useGraphStore((s) => s.truncated);
  const error = useGraphStore((s) => s.error);

  /**
   * Theme G.3's row-count ceiling: a kept-alive hidden graph past
   * `GRAPH_KEEP_ALIVE_MAX_ROWS` unmounts immediately rather than waiting out
   * its TTL, so a 100k-commit repo cannot hold two full row buffers in
   * memory at once. A no-op while `visible` — an active graph's own row
   * count growing past the ceiling is normal use, not hidden waste, and
   * `evictKeptViewIfOverRows` already ignores a call for a view that is not
   * the currently kept one.
   */
  useEffect(() => {
    if (visible) return;
    evictKeptViewIfOverRows('graph', rowCount);
  }, [visible, rowCount]);

  const { data: refs = [] } = useRefs(repoId);
  const { data: stashes = [] } = useStashes(repoId);
  const refsBySha = useRefsBySha(refs);
  const branchCount = useMemo(() => countLocalBranches(refs), [refs]);
  // Every `rows`-derived memo below lists `rowCount` too: `rows` never
  // changes identity mid-stream (see above), so `rowCount` is what actually
  // makes these recompute as batches arrive.
  const authorCount = useMemo(
    () => summariseAuthors(rows).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rowCount],
  );
  const firstCommit = useMemo(
    () => firstCommitDate(rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rowCount],
  );

  const { data: status } = useStatus();
  const currentBranch = status?.branch.head ?? null;
  const dialogs = useDialogs();
  const [opError, setOpError] = useState('');
  const { commitMenu, refMenu, dropMenu, checkoutRef, report, syncFor, runSync, syncing } =
    useGraphActions(setOpError, refs);

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
    (event: { clientX: number; clientY: number }, row: (typeof rows)[number]) => {
      // The row's own right-click handler calls `onSelect` first, which is
      // now a TOGGLE — so a right-click on the open row would close it under
      // the menu. Selecting again here keeps the menu's target open.
      useUiStore.getState().selectCommit(row.commit.sha);
      dialogs.openMenu(event, commitMenu(row, currentBranch));
    },
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

  // The session behind `isAgentActive(ref)` — a separate map rather than
  // folded into the callback above because most rows never call this one at
  // all (only a ref whose badge is about to render the avatar does).
  const activeAgentSessions = useActiveAgentWorktreeSessions();
  const agentSessionFor = useCallback(
    (ref: (typeof refs)[number]) =>
      ref.worktreePath ? activeAgentSessions.get(ref.worktreePath) : undefined,
    [activeAgentSessions],
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
  /*
    Cascading reveal (Theme K): mount, re-reveal after being hidden — Theme
    G's keep-alive means this same component instance can go on existing,
    unmounted, behind another view and come back later — and a repo switch
    all replay the stagger. A watcher-driven re-stream must NOT: it only
    bumps the graph store's own `requestId`, which is why `revealKey` below
    is built from `repoId` and a reveal counter instead, and never from
    `requestId` the way this used to hand-roll it (`isCascading`/
    `prevRequestId`, kept only in history — see `use-cascade-reveal.ts`).

    The counter itself only needs to change on invisible-to-visible; a repo
    switch is already covered because `repoId` is part of the key, and a
    fresh mount already cascades for free (`useCascadeReveal` arms
    immediately on its first call, regardless of the key's value).
  */
  const revealCount = useRevealCount(visible);
  const { active: isCascading, styleFor: cascadeStyleFor } = useCascadeReveal({
    revealKey: `${repoId}:${revealCount}`,
    steps: GRAPH_CASCADE_MAX_STEPS,
  });

  // Live ticker for recent commits. If any commit in the loaded window is still
  // inside `RECENCY_WINDOW_MS`, tick every 5 seconds so the row effects and the
  // relative date decay smoothly through the tiers ('just now' -> '1m ago' ->
  // ... -> normal) instead of only on the next render the store happens to cause.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasRecentCommits = useMemo(() => {
    // Only check the top 10 commits as history is reverse-chronological.
    // `rowCount`, not `rows.length` — same reason as every other memo here:
    // `rows` never changes identity mid-stream, so reading the length off the
    // array would leave this memo with nothing that ever invalidates it.
    const limit = Math.min(rowCount, 10);
    const cutoff = (nowMs - RECENCY_WINDOW_MS) / 1000;
    for (let i = 0; i < limit; i++) {
      if (rows[i]!.commit.committerDate >= cutoff) return true;
    }
    return false;
  }, [rows, rowCount, nowMs]);

  useEffect(() => {
    if (!hasRecentCommits) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, [hasRecentCommits]);

  // dnd-kit's drag-end event carries no pointer position, and the drop menu has
  // to appear where the user released.
  const lastPointer = useRef({ clientX: 0, clientY: 0 });
  /*
    The inline panel's height: the persisted preference, dragged from the
    slot's bottom edge, clamped to what the graph column can actually spare —
    the bounds in the store are absolute pixels and cannot know the window.
    A commit's panel may take all but a few rows' worth of the column; the
    working copy's sits ABOVE the scroller, so it takes a smaller share and
    leaves the history under it on screen.
  */
  const [columnHeight, setColumnHeight] = useState(0);
  // A callback ref: the column only mounts once history has loaded, after
  // this component's first effects have already run.
  const columnObserver = useRef<ResizeObserver | null>(null);
  const columnRef = useCallback((el: HTMLDivElement | null) => {
    columnObserver.current?.disconnect();
    columnObserver.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setColumnHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(el);
    columnObserver.current = observer;
  }, []);
  const inlineHeightPref = useUiStore((s) => s.layout.graphInlineHeight);
  const inlineMin = LAYOUT_BOUNDS.graphInlineHeight.min;
  const inlineMax = Math.max(
    inlineMin,
    Math.min(LAYOUT_BOUNDS.graphInlineHeight.max, columnHeight - INLINE_HEADROOM),
  );
  const inline = useResizable({
    size: inlineHeightPref,
    onSize: (value) => setLayout('graphInlineHeight', value),
    initial: DEFAULT_LAYOUT.graphInlineHeight,
    axis: 'y',
    min: inlineMin,
    max: inlineMax,
  });
  const workingTreeHeight = Math.min(
    inline.current,
    Math.max(inlineMin, Math.round(columnHeight * WORKING_TREE_SHARE)),
  );

  /*
    Which commit row is expanded, and which one is still animating shut.

    The expanded one is the selection; the closing one is the selection that
    was, kept in state for exactly as long as its collapse runs (until
    `InlineExpander`'s `onExited`), so opening another row can collapse the
    first while the second opens instead of cutting it out mid-frame. Adjusted
    during render rather than in an effect, so no frame renders the previous
    row without its panel before the closing one mounts.
  */
  const expandedSha = selectedSha;
  const [lastExpanded, setLastExpanded] = useState(expandedSha);
  const [closingSha, setClosingSha] = useState<string | null>(null);
  if (lastExpanded !== expandedSha) {
    setLastExpanded(expandedSha);
    setClosingSha(lastExpanded ?? (closingSha === expandedSha ? null : closingSha));
  }
  /** The working copy's panel stays mounted until its own collapse finishes. */
  const [workingTreeMounted, setWorkingTreeMounted] = useState(workingTreeOpen);
  if (workingTreeOpen && !workingTreeMounted) setWorkingTreeMounted(true);
  /** Which panels have already played their entrance — see `InlineExpander`. */
  const [seenPanels] = useState(() => new Set<string>());

  /*
    Every row is the theme's row height except the expanded one, which is its
    row plus its panel. The expanded and the closing row are MEASURED
    (`measureElement` on their wrappers) so the rows below follow the panel's
    animated height frame by frame; the estimate below is only what the
    virtualizer falls back to after a cache reset (`measure()` on a style
    change), so it must already account for the panel.

    Keyed by sha, not index: a commit made from the inline panel streams in a
    new row 0 and shifts every index by one, and an index-keyed size cache
    would hand the panel's height to the row above the one that has it.
  */
  const expandedIndex = useMemo(
    () => (expandedSha === null ? -1 : rows.findIndex((row) => row.commit.sha === expandedSha)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rowCount, expandedSha],
  );
  const sizing = useRef({ expandedIndex, slot: inline.current + SLOT_CHROME, rowHeight: theme.rowHeight });
  sizing.current = { expandedIndex, slot: inline.current + SLOT_CHROME, rowHeight: theme.rowHeight };
  const estimateSize = useCallback(
    (index: number) =>
      index === sizing.current.expandedIndex
        ? sizing.current.rowHeight + sizing.current.slot
        : sizing.current.rowHeight,
    [],
  );
  const getItemKey = useCallback(
    (index: number) => useGraphStore.getState().rows[index]?.commit.sha ?? index,
    // A new stream is a new buffer: re-key it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestId],
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey,
    // Every other row is exactly the theme's row height, so measurement is overhead.
    overscan: 24,
  });

  /**
   * Once a panel has opened, scroll just far enough that the whole of it is
   * on screen — the row it opened under stays where it was when it fits.
   */
  const revealExpanded = useCallback(() => {
    const el = scrollRef.current;
    const index = sizing.current.expandedIndex;
    if (!el || index < 0) return;
    const item = virtualizer.getVirtualItems().find((candidate) => candidate.index === index);
    if (!item) return;
    const bottom = item.end;
    const viewBottom = el.scrollTop + el.clientHeight;
    if (bottom <= viewBottom) return;
    const top = Math.min(item.start, bottom - el.clientHeight);
    // `?.`: jsdom's elements have no `scrollTo`.
    el.scrollTo?.({ top, behavior: isReducedMotion() ? 'auto' : 'smooth' });
  }, [virtualizer]);

  /*
    A commit selected from somewhere else — the palette, the dashboard, a sha
    linked out of a commit message — opens under a row that may be nowhere
    near the viewport. Bring it to the top; a click on a row on screen is
    already in range and does not move anything.
  */
  useEffect(() => {
    if (expandedIndex < 0) return;
    const { startIndex, endIndex } = virtualizer.range ?? { startIndex: -1, endIndex: -1 };
    if (expandedIndex >= startIndex && expandedIndex <= endIndex) return;
    virtualizer.scrollToIndex(expandedIndex, { align: 'start' });
    // Only when the selection moves, not on every range change while scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedSha, expandedIndex >= 0]);

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

  /*
    The CI column: runs for the rows on screen (plus a little overscan), asked
    for page by page as the viewport settles — never for the whole history.
    `showCi && visible` is the column's own gate: a hidden column, or a
    kept-alive graph behind another view, asks for nothing and polls nothing.
  */
  const ciBySha = useCommitCi(repoId, rows, rowCount, virtualizer.range, showCi && visible);
  const ciRef = useRef(ciBySha);
  ciRef.current = ciBySha;
  const [ciModal, setCiModal] = useState<{ sha: string; subject: string | null; ci: CommitCi } | null>(null);
  /*
    Stable, so the memoised rows are not re-rendered each time a CI page lands.
    The snapshot taken here is only the fallback: the modal reads the live map
    while it is open, so a polled run advances in front of the reader.
  */
  const onOpenCi = useCallback((sha: string) => {
    const ci = ciRef.current.get(sha);
    if (!ci) return;
    const subject = useGraphStore.getState().rows.find((row) => row.commit.sha === sha)?.commit.subject ?? null;
    setCiModal({ sha, subject, ci });
  }, []);

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

  const highlightedShas = useMemo(
    () => (graphShaFilter === null ? null : new Set(graphShaFilter)),
    [graphShaFilter],
  );

  const authors = useMemo(
    () => summariseAuthors(rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rowCount],
  );

  /**
   * The lane the selected commit sits on — what the branch highlight keys off.
   *
   * Derived here rather than in the row because a row cannot see the selection
   * unless it IS the selection, and the point of the highlight is the rows that
   * are not: the whole branch lights up, above and below the commit picked.
   *
   * `null` while the selected sha is below the loaded window, which is normal
   * on a large repo mid-stream — nothing glows until its row streams in.
   */
  const glowColorIdx = useMemo(
    () => rows.find((row) => row.commit.sha === selectedSha)?.colorIdx ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rowCount, selectedSha],
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [headOid, rows, rowCount],
  );

  /*
    The working-copy panel belongs to the uncommitted-changes row, so when a
    commit takes the last change with it the row goes and the panel follows.
    Only on a real, loaded status: `undefined` is "not read yet", not clean.
  */
  const workingTreeGone = status !== undefined && !hasUncommittedWork(status);
  useEffect(() => {
    if (workingTreeOpen && workingTreeGone) selectWorkingTree(false);
  }, [workingTreeOpen, workingTreeGone, selectWorkingTree]);

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
      <div
        ref={columnRef}
        className="flex min-w-0 flex-1 flex-col"
        style={graphColumnVars(columns)}
        data-graph-ci={showCi ? 'on' : 'off'}
      >
        {status ? (
          <ConflictBanner status={status} onError={setOpError} onOpenConflict={selectConflict} />
        ) : null}
        <GraphDefs theme={theme} />
        <GraphHeader
          refs={refs}
          authors={authors}
          gutterWidth={paintedGutter}
          columns={columns}
          theme={theme}
          matchingAgents={matchingAgents}
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
            expanded={workingTreeOpen}
            onSelect={() => selectWorkingTree(!workingTreeOpen)}
          />
        ) : null}

        {/*
          The working copy's panel, expanded in place under its row — the
          Changes view's list, commit box and diff, folded into the graph.
          Outside the scroller like the row itself, so it never scrolls away
          from the row it belongs to.
        */}
        {hasUncommittedWork(status) && (workingTreeOpen || workingTreeMounted) ? (
          <InlineExpander
            id="working-tree"
            open={workingTreeOpen}
            seen={seenPanels}
            onExited={() => setWorkingTreeMounted(false)}
          >
            <InlineSlot
              label="Working copy changes"
              lanes={[{ lane: headRow?.lane ?? 0, colorIdx: headRow?.colorIdx ?? 0, dashed: true }]}
              theme={theme}
              gutterWidth={paintedGutter}
              laneWidth={laneWidth}
              height={workingTreeHeight}
              resizable={inline}
            >
              <WorkingTreeInlinePanel
                active={visible && workingTreeOpen}
                onClose={() => selectWorkingTree(false)}
              />
            </InlineSlot>
          </InlineExpander>
        ) : null}

        {/*
          Also above the scroller, for the same reason the working copy is
          (Phase 22 Theme C): a stash is shelved uncommitted work, not history,
          and giving it a fake `GraphRow` would put it in the virtualizer's
          index space as something every `rows[i]` lookup has to exclude again.
        */}
        {stashes.length > 0 ? (
          <StashRows
            repoId={repoId}
            stashes={stashes}
            theme={theme}
            gutterWidth={paintedGutter}
            laneWidth={laneWidth}
            colorIdx={headRow?.colorIdx ?? 0}
            lane={headRow?.lane ?? 0}
            selectedSelector={graphSelection?.kind === 'stash' ? graphSelection.selector : null}
            onSelect={selectStash}
          />
        ) : null}

        {/*
          Keyed on requestId so the list resets when stream changes — this
          remounts every row's DOM node on a restream, but that no longer
          replays the cascade (Theme K): `isCascading` comes from
          `useCascadeReveal`, keyed on `repoId`/reveal-count rather than on
          `requestId`, so a restream-driven remount finds it already settled
          and the fresh rows carry no entrance class at all.

          On a genuine reveal (mount, coming back from another view, a repo
          switch) each commit in the visible viewport fades in top to bottom;
          once that settles, scrolling through the virtualised list has zero
          animation interference.
        */}
        <div
          key={requestId ?? 'empty'}
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto"
          role="grid"
        >
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
            // Agent-glow halos portal in here rather than to <body> — see
            // `GLOW_LAYER_ATTR` in ref-agent-glow-bleed.tsx.
            data-graph-glow-layer=""
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const isInitialCascade = isCascading && item.index <= GRAPH_CASCADE_MAX_STEPS;
              const commitProv = provenance[row.commit.sha] ?? HUMAN_PROVENANCE;
              const authorMatches =
                highlightedEmails === null ||
                highlightedEmails.has(row.commit.authorEmail.trim().toLowerCase());
              const shaMatches = highlightedShas === null || highlightedShas.has(row.commit.sha);
              const provenanceMatches = matchesProvenanceFilter(commitProv, graphProvenanceFilter);
              const dimmed = !authorMatches || !shaMatches || !provenanceMatches;
              const { sessionName, agent } = resolveProvenanceDetails(commitProv, agents, sessions);
              const slotOpen = row.commit.sha === expandedSha;
              const slotClosing = !slotOpen && row.commit.sha === closingSha;

              return (
                <div
                  key={row.commit.sha}
                  // Only a row with a panel under it is measured — see `estimateSize`.
                  ref={slotOpen || slotClosing ? virtualizer.measureElement : undefined}
                  data-index={item.index}
                  className={`absolute left-0 top-0 w-full ${
                    isInitialCascade ? 'animate-fade-in cascade-delay' : ''
                  }`}
                  style={{
                    transform: `translateY(${item.start}px)`,
                    ...(isInitialCascade ? cascadeStyleFor(item.index) : undefined),
                  }}
                >
                  <CommitGraphRow
                    row={row}
                    refs={refsBySha.get(row.commit.sha) ?? EMPTY_REFS}
                    selected={selectedSha === row.commit.sha}
                    gutterWidth={paintedGutter}
                    laneWidth={laneWidth}
                    theme={theme}
                    clipId={avatarClipId(theme)}
                    dimmed={dimmed}
                    glowColorIdx={glowColorIdx}
                    nowMs={nowMs}
                    provenance={commitProv}
                    sessionName={sessionName}
                    agent={agent}
                    markMode={provenanceMarkMode}
                    ci={showCi ? ciBySha.get(row.commit.sha) : undefined}
                    onOpenCi={onOpenCi}
                    onSelect={toggleCommit}
                    onContextMenu={onRowContextMenu}
                    onRefContextMenu={onRefContextMenu}
                    onRefActivate={onRefActivate}
                    syncFor={syncFor}
                    onSync={runSync}
                    syncing={syncing}
                    currentBranch={currentBranch}
                    isAgentActive={isAgentActive}
                    agentSessionFor={agentSessionFor}
                  />
                  {slotOpen || slotClosing ? (
                    <InlineExpander
                      id={`commit:${row.commit.sha}`}
                      open={slotOpen}
                      seen={seenPanels}
                      onEntered={revealExpanded}
                      onExited={() =>
                        setClosingSha((current) => (current === row.commit.sha ? null : current))
                      }
                    >
                      <InlineSlot
                        label={`Commit ${row.commit.sha.slice(0, 7)} details`}
                        lanes={lanesLeaving(row)}
                        theme={theme}
                        gutterWidth={paintedGutter}
                        laneWidth={laneWidth}
                        height={inline.current}
                        resizable={inline}
                      >
                        <CommitInlinePanel
                          repoId={repoId}
                          sha={row.commit.sha}
                          onClose={() => selectCommit(null)}
                        />
                      </InlineSlot>
                    </InlineExpander>
                  ) : null}
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
          <span className="flex items-center gap-1.5 tabular-nums">
            <LuGitCommitVertical aria-hidden className="h-3 w-3 shrink-0" />
            {formatNumber(rows.length)} commits
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <LuGitBranch aria-hidden className="h-3 w-3 shrink-0" />
            {formatNumber(branchCount)} branches
          </span>
          {loading ? <span>loading…</span> : null}
          {truncated ? <span>history truncated at the row cap</span> : null}
          <span className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 tabular-nums">
              <LuUsers aria-hidden className="h-3 w-3 shrink-0" />
              {formatNumber(authorCount)} authors
            </span>
            {firstCommit !== null ? <span>first commit {formatDate(firstCommit)}</span> : null}
          </span>
        </footer>
      </div>

      {/*
        The right-hand aside, for what does NOT open inline: a stash entry and
        the Conflict Resolution Studio. Commits and the working copy expand in
        place under their own rows instead.
      */}
      {graphSelection?.kind === 'stash' || graphSelection?.kind === 'conflict' ? (
        <>
          <ResizeHandle resizable={detail} axis="x" label="Resize commit detail" />
          <aside
            className={`flex shrink-0 flex-col border-l border-border ${
              detail.dragging ? '' : 'transition-[width] duration-150 ease-in-out'
            }`}
            style={{ width: detail.current }}
          >
            <div className="min-h-0 flex-1">
              {graphSelection.kind === 'stash' ? (
                <StashInspector
                  repoId={repoId}
                  selector={graphSelection.selector}
                  onClose={() => selectStash(null)}
                  onError={setOpError}
                />
              ) : (
                <ConflictResolutionStudio
                  repoId={repoId}
                  worktreePath={selectedWorktreePath ?? undefined}
                  path={graphSelection.path}
                  onClose={() => selectConflict(null)}
                  onError={setOpError}
                />
              )}
            </div>
          </aside>
        </>
      ) : null}
      </div>
      {ciModal !== null ? (
        <CiRunModal
          repoId={repoId}
          sha={ciModal.sha}
          subject={ciModal.subject}
          ci={ciBySha.get(ciModal.sha) ?? ciModal.ci}
          onClose={() => setCiModal(null)}
        />
      ) : null}
    </GraphDndProvider>
  );
}

const EMPTY_REFS: never[] = [];

/** What the inline panel leaves of the column: the header, a couple of rows and the footer. */
const INLINE_HEADROOM = 160;
/** The working copy's panel's ceiling, as a share of the graph column. */
const WORKING_TREE_SHARE = 0.6;
/** The slot's own chrome around the card: the lane gaps above and below it, and the splitter. */
const SLOT_CHROME = SLOT_INSET * 2 + 5;

/**
 * How many of the graph's initial rows get a staggered fade-in.
 *
 * Higher than `cascade.ts`'s own CASCADE_MAX_STEPS (12): the graph's rows are
 * denser and shorter than a sidebar list, so a typical viewport shows closer
 * to 20 of them, and capping short of that would flatten the stagger before
 * it ever reached the fold.
 */
const GRAPH_CASCADE_MAX_STEPS = 20;

/**
 * Lanes the gutter will draw before it stops widening.
 *
 * A pathological history — a repo with fifty concurrent branches — would
 * otherwise push the commit subjects off the right edge of the window. Beyond
 * this the deeper lanes are simply not drawn.
 */
const MAX_GUTTER_LANES = 12;

const EMPTY_SESSIONS: ClosedSession[] = [];
const HUMAN_PROVENANCE: CommitProvenance = { kind: 'human' };

