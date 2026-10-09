import { useMemo, useState } from 'react';

import { pickForgeRemote, type StatsWindow } from '@midnite/studio-shared';
import {
  LuActivity,
  LuArrowDown,
  LuArrowUp,
  LuBot,
  LuCalendar,
  LuCalendarDays,
  LuChartColumn,
  LuChartCandlestick,
  LuChartPie,
  LuCircleDot,
  LuClock,
  LuCoins,
  LuCreditCard,
  LuGitPullRequest,
  LuHeartPulse,
  LuHistory,
  LuLayoutGrid,
  LuNewspaper,
  LuPlay,
  LuReceipt,
  LuRefreshCw,
  LuRepeat,
  LuRotateCcw,
  LuStar,
  LuStickyNote,
  LuTerminal,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu';
import GridLayout, { useContainerWidth, type LayoutItem } from 'react-grid-layout';

import { BrandMark } from '../../components/brand';
import type { MenuItem } from '../../components/context-menu';
import { EmptyState } from '../../components/empty-state';
import { IconButton, type IconComponent } from '../../components/icon-button';
import { MultiSelectMenu } from '../../components/multi-select-menu';
import { formatNumber } from '../../lib/format-number';
import { useCascadeReveal } from '../../lib/use-cascade-reveal';
import {
  useForgeIssues,
  useForgePulls,
  useForgeRuns,
  useRefreshStats,
  useRemotes,
  useRepoStats,
} from '../../services/queries';
import {
  boardFor,
  boardKeyFor,
  inReadingOrder,
  useDashboardStore,
  type WidgetLayout,
} from '../../store/dashboard-store';
import { useUiStore } from '../../store/ui-store';
import { byCommits, scopeStats } from './dashboard-derive';
import { GRID_COLS, GRID_MARGIN, ROW_HEIGHT, isWidgetId, type WidgetId } from './widget-ids';
import { DRAG_HANDLE_CLASS, NO_DRAG_CLASS, WidgetFrame } from './widget-frame';
import { DashboardTabs } from './dashboard-tabs';
import { WidgetPicker } from './widget-picker';
import { availableWidgets, needsChurn, renderableWidgets, WIDGETS } from './widget-registry';
import {
  AgentActivityWidget,
  AgentRosterWidget,
  LiveSessionsWidget,
  LoopRunsWidget,
  RecentSessionsWidget,
} from './widgets/agent-widgets';
import { ClockWidget, DateWidget, ScratchpadWidget } from './widgets/general-widgets';
import { ActivityWidget } from './widgets/activity-widget';
import { CalendarWidget } from './widgets/calendar-widget';
import { ContributorsWidget } from './widgets/contributors-widget';
import { IssuesWidget, PullsWidget, RunsWidget } from './widgets/forge-widgets';
import { HealthWidget } from './widgets/health-widget';
import { PageDetachMark } from '../../components/page-detach-mark';
import { AllocationWidget } from '../finance-dashboard/allocation-widget';
import { AssetListWidget } from '../finance-dashboard/asset-list-widget';
import { AssetStackWidget } from '../finance-dashboard/asset-stack-widget';
import { BankCardsWidget } from '../finance-dashboard/bank-cards-widget';
import { BigChartWidget } from '../finance-dashboard/big-chart-widget';
import { FinanceHeaderControls } from '../finance-dashboard/finance-header-controls';
import { NewsWidget } from '../finance-dashboard/news-widget';
import { TransactionsWidget } from '../finance-dashboard/transactions-widget';

/**
 * The repository's front page.
 *
 * One repository at a time, following the sidebar selection — the same rule the
 * Phase 18 diagnostics segment follows, and the reason there is no cross-repo
 * roll-up here.
 *
 * The forge queries are `enabled` on whether their widget is actually on the
 * board, not on whether the view is open. That keeps the sidebar sections'
 * standing promise — every `gh` call is a subprocess and an API request against
 * the user's rate limit — while letting a board that genuinely shows PRs fetch
 * them without a second click.
 *
 * The house ladder — error → empty → skeleton → content
 * (`components/skeleton.tsx`) — runs at two levels here, and deliberately so.
 * The statistics pass feeds four of the seven widgets at once, so a pass that
 * threw is a fact about the BOARD and is answered here, before the grid is
 * built; each widget then answers its own empty and its own skeleton, because
 * "no open pull requests" is not something the board can say on a widget's
 * behalf. Before Phase 60 Theme C the failure had no branch at all: a
 * `git log` that threw left four widgets shimmering indefinitely, which is the
 * one thing a skeleton must never be allowed to mean.
 */
const WINDOW_LABELS: Record<StatsWindow, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '1y': 'Last year',
  all: 'All time',
};

/** One glyph per widget, for the board's own "add/remove widget" menu. */
const WIDGET_ICON: Record<WidgetId, IconComponent> = {
  calendar: LuCalendar,
  contributors: LuUsers,
  activity: LuActivity,
  pulls: LuGitPullRequest,
  issues: LuCircleDot,
  runs: LuPlay,
  health: LuHeartPulse,
  'agent-roster': LuBot,
  'live-sessions': LuTerminal,
  'recent-sessions': LuHistory,
  'agent-activity': LuChartColumn,
  'loop-runs': LuRepeat,
  'fin-bank-cards': LuCreditCard,
  'fin-assets': LuCoins,
  'fin-allocation': LuChartPie,
  'fin-chart': LuChartCandlestick,
  'fin-watchlist': LuStar,
  'fin-markets': LuLayoutGrid,
  'fin-transactions': LuReceipt,
  'fin-news': LuNewspaper,
  clock: LuClock,
  date: LuCalendarDays,
  scratchpad: LuStickyNote,
};

export function DashboardView() {
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const selectCommit = useUiStore((s) => s.selectCommit);

  const boards = useDashboardStore((s) => s.boards);
  const activeId = useDashboardStore((s) => s.activeId);
  const setScratch = useDashboardStore((s) => s.setScratch);
  /*
    The Git dashboard is per repository (its key is the repo id); every other
    dashboard is global and keyed `dash:<id>`. `null` only for Git with no repo.
  */
  const boardKey = boardKeyFor(activeId, selectedRepoId);
  const board = boardFor(boards, boardKey);
  const setLayout = useDashboardStore((s) => s.setLayout);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const moveWidget = useDashboardStore((s) => s.moveWidget);
  const setAuthors = useDashboardStore((s) => s.setAuthors);
  const setWindow = useDashboardStore((s) => s.setWindow);
  const resetLayout = useDashboardStore((s) => s.resetLayout);

  const { data: remotes } = useRemotes(selectedRepoId);
  const forge = pickForgeRemote(remotes ?? [])?.forge ?? null;
  const hasForge = forge?.kind === 'github';

  const layoutIds = useMemo(() => board.layout.map((item) => item.i), [board.layout]);
  const specs = useMemo(() => renderableWidgets(layoutIds, hasForge), [layoutIds, hasForge]);
  const onBoard = useMemo(() => new Set(specs.map((spec) => spec.id)), [specs]);

  const withChurn = needsChurn(layoutIds);
  // Only a board that shows a repository-derived card pays for the traversal —
  // the Agents dashboard, say, never touches git.
  const usesStats = specs.some((spec) => spec.source === 'stats' || spec.source === 'both');
  const usesRepo = usesStats || specs.some((spec) => spec.source === 'forge');
  const usesFinance = specs.some((spec) => spec.category === 'finance');
  const {
    data: rawStats,
    isFetching: statsFetching,
    error: statsError,
  } = useRepoStats(selectedRepoId, board.window, withChurn, usesStats);
  const refreshStats = useRefreshStats(selectedRepoId);

  const pulls = useForgePulls(selectedRepoId, hasForge && onBoard.has('pulls'));
  const issues = useForgeIssues(selectedRepoId, hasForge && onBoard.has('issues'));
  const runs = useForgeRuns(selectedRepoId, hasForge && onBoard.has('runs'));

  /*
    Scoped ONCE, here, and handed down. Three widgets each applying the author
    filter in their own `useMemo` would be three chances for the calendar, the
    feed and the contributor table to disagree about who is included.
  */
  const stats = useMemo(
    () => (rawStats ? scopeStats(rawStats, board.authors) : undefined),
    [rawStats, board.authors],
  );

  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const authorOptions = useMemo(
    () =>
      byCommits(rawStats?.contributors ?? []).map((person) => ({
        value: person.email,
        label: person.name,
        keywords: person.email,
        meta: <span className="tabular-nums">{formatNumber(person.commits)}</span>,
      })),
    [rawStats?.contributors],
  );

  // Only the Git dashboard needs a repository to say anything at all; a custom
  // dashboard renders without one (its repo-derived cards just stay empty).
  if (boardKey === null) return <NoRepo tabs />;

  // Error before anything else. `statsError` covers the whole four-widget
  // group, so a shimmering board would be four lies at once.
  if (statsError && usesStats) {
    return (
      <EmptyState
        icon={LuHeartPulse}
        title="Could not read this repository's history"
        body={statsError instanceof Error ? statsError.message : String(statsError)}
      />
    );
  }

  const repoId = boardKey;

  const toggleAuthor = (email: string): void =>
    setAuthors(
      repoId,
      board.authors.includes(email)
        ? board.authors.filter((value) => value !== email)
        : [...board.authors, email],
    );

  /**
   * Everything this dashboard could offer. Only widgets this repository could
   * ever populate appear — a repo with no GitHub remote offers no PRs, issues or
   * runs entry at all, rather than three entries that add a permanently empty
   * tile.
   */
  const offered = availableWidgets(hasForge);

  const ordered = inReadingOrder(board.layout);
  const widgetMenu = (id: WidgetId): MenuItem[] => {
    const index = ordered.findIndex((item) => item.i === id);
    return [
      {
        label: 'Move up',
        icon: LuArrowUp,
        onSelect: () => moveWidget(repoId, id, -1),
        disabled: index <= 0,
      },
      {
        label: 'Move down',
        icon: LuArrowDown,
        onSelect: () => moveWidget(repoId, id, 1),
        disabled: index === -1 || index >= ordered.length - 1,
      },
      { type: 'separator' as const },
      {
        label: 'Remove widget',
        icon: LuTrash2,
        onSelect: () => removeWidget(repoId, id),
        danger: true,
      },
    ];
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <PageDetachMark role="dashboard" />
        <h2 className="sr-only">Dashboard</h2>
        <DashboardTabs />

        {/*
          The Finance cards' global controls (timescale, display currency).
          Keyed on the cards actually on the board rather than on which
          dashboard is active, so a custom dashboard that borrowed one still
          gets them.
        */}
        {usesFinance ? <FinanceHeaderControls /> : null}

        {usesStats ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="sr-only sm:not-sr-only">Window</span>
            <select
              aria-label="Statistics window"
              value={board.window}
              onChange={(event) => setWindow(repoId, event.target.value as StatsWindow)}
              className="rounded border border-border bg-background px-1.5 py-1 text-xs"
            >
              {(Object.keys(WINDOW_LABELS) as StatsWindow[]).map((value) => (
                <option key={value} value={value}>
                  {WINDOW_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {usesStats ? (
          <MultiSelectMenu
            options={authorOptions}
            selected={board.authors}
            onChange={(next) => setAuthors(repoId, next)}
            icon={<LuUsers aria-hidden className="h-3.5 w-3.5" />}
            allLabel="All authors"
            searchPlaceholder="Filter authors…"
            emptyLabel="No contributors in this window."
            label="Filter the board by author"
            summarise={(count) => `${count} authors`}
          />
        ) : null}

        {usesRepo ? (
          <IconButton
            icon={LuRefreshCw}
            label="Recompute repository statistics"
            size="sm"
            busy={statsFetching}
            onClick={refreshStats}
          />
        ) : null}

        <IconButton
          icon={LuRotateCcw}
          label="Reset layout"
          size="sm"
          onClick={() => resetLayout(repoId)}
        />

        <WidgetPicker
          specs={offered}
          onBoard={onBoard}
          icons={WIDGET_ICON}
          onAdd={(id) => addWidget(repoId, id)}
        />
      </header>

      <Board
        revealKey={`${activeId}:${selectedRepoId ?? ''}`}
        specs={specs}
        layout={board.layout}
        onLayoutChange={(next) => setLayout(repoId, next)}
        renderWidget={(id) => {
          switch (id) {
            case 'calendar':
              return (
                <CalendarWidget
                  stats={stats}
                  loading={statsFetching && !rawStats}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                />
              );
            case 'contributors':
              return (
                <ContributorsWidget
                  stats={stats}
                  loading={statsFetching && !rawStats}
                  authors={board.authors}
                  onToggleAuthor={toggleAuthor}
                />
              );
            case 'activity':
              return (
                <ActivityWidget
                  stats={stats}
                  loading={statsFetching && !rawStats}
                  selectedDay={selectedDay}
                  onClearDay={() => setSelectedDay(null)}
                  onSelectCommit={(sha) => {
                    selectCommit(sha);
                    setActiveView('graph');
                  }}
                />
              );
            case 'pulls':
              return (
                <PullsWidget
                  result={pulls.data}
                  isFetching={pulls.isFetching}
                  repoId={repoId}
                  forge={forge}
                />
              );
            case 'issues':
              return (
                <IssuesWidget result={issues.data} isFetching={issues.isFetching} repoId={repoId} />
              );
            case 'runs':
              return <RunsWidget result={runs.data} isFetching={runs.isFetching} repoId={repoId} />;
            case 'health':
              return <HealthWidget stats={stats} loading={statsFetching && !rawStats} />;
            case 'agent-roster':
              return <AgentRosterWidget />;
            case 'live-sessions':
              return <LiveSessionsWidget />;
            case 'recent-sessions':
              return <RecentSessionsWidget />;
            case 'agent-activity':
              return <AgentActivityWidget />;
            case 'loop-runs':
              return <LoopRunsWidget />;
            case 'fin-bank-cards':
              return <BankCardsWidget />;
            case 'fin-assets':
              return <AssetStackWidget />;
            case 'fin-allocation':
              return <AllocationWidget />;
            case 'fin-chart':
              return <BigChartWidget />;
            case 'fin-watchlist':
              return <AssetListWidget list="watchlist" />;
            case 'fin-markets':
              return <AssetListWidget list="markets" />;
            case 'fin-transactions':
              return <TransactionsWidget />;
            case 'fin-news':
              return <NewsWidget />;
            case 'clock':
              return <ClockWidget />;
            case 'date':
              return <DateWidget />;
            case 'scratchpad':
              return (
                <ScratchpadWidget
                  text={board.scratch ?? ''}
                  onChange={(text) => setScratch(repoId, text)}
                />
              );
          }
        }}
        widgetMenu={widgetMenu}
      />
    </div>
  );
}

function Board({
  revealKey,
  specs,
  layout,
  onLayoutChange,
  renderWidget,
  widgetMenu,
}: {
  revealKey: string;
  specs: readonly { id: WidgetId; title: string; minW: number; minH: number }[];
  layout: readonly WidgetLayout[];
  onLayoutChange: (next: WidgetLayout[]) => void;
  renderWidget: (id: WidgetId) => React.ReactNode;
  widgetMenu: (id: WidgetId) => MenuItem[];
}) {
  /*
    Theme K.5: `DashboardView` itself does not unmount on a repo switch (only
    `EmptyWorkspace` ↔ this component does, when a repo goes from none to
    one or back), so the tiles need an explicit reveal key. `react-grid-
    layout` positions tiles by x/y grid coordinates rather than document
    flow, so "top-to-bottom" is approximate here — `cascadeStyle`'s `--i`
    only ever drives a stagger delay, never a position, so staggering by
    `specs` order still reads as one board arriving together rather than a
    literal row-by-row wipe.
  */
  const cascade = useCascadeReveal({ revealKey });
  /*
    The library's own container hook, not `WidthProvider`.

    v1's `WidthProvider` listened to `window.resize` and nothing else, which is
    wrong for this app specifically: the repositories sidebar and the terminal
    panel are both resizable, so the board's width changes constantly without
    the window's ever changing. v2 replaced it with a `ResizeObserver` on the
    container — the responsive-container pattern the phase asked for, already
    written — so there is nothing here worth hand-rolling.
  */
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });

  const gridLayout: LayoutItem[] = specs.map((spec) => {
    const item = layout.find((entry) => entry.i === spec.id);
    return {
      i: spec.id,
      x: item?.x ?? 0,
      y: item?.y ?? 0,
      w: item?.w ?? spec.minW,
      h: item?.h ?? spec.minH,
      minW: spec.minW,
      minH: spec.minH,
    };
  });

  // The board's own empty state: a repository with every widget removed. Not a
  // loading state and not a failure — the board is exactly as the user left it.
  if (specs.length === 0) {
    return (
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-4">
        <EmptyState
          icon={LuLayoutGrid}
          title="No widgets on this board"
          body="Use Add widget, in the header above, to add some."
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-3">
      {/*
        Rendered only once measured. The grid positions from the width it is
        given, so a first paint at width 0 stacks every tile at the origin and
        then visibly scatters them a frame later — which is what
        `measureBeforeMount` plus this guard together prevent.
      */}
      {mounted && width > 0 ? (
        <GridLayout
          className="dashboard-grid"
          gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: GRID_MARGIN }}
          width={width}
          layout={gridLayout}
          /*
            Only the tile HEADER drags. A whole-tile handle makes every link,
            row and button inside a widget unclickable — the pointerdown starts
            a drag instead of a click.
          */
          dragConfig={{ handle: `.${DRAG_HANDLE_CLASS}`, cancel: `.${NO_DRAG_CLASS}` }}
          /*
            Every card resizes from its corners and edges, not only the
            south-east corner the library defaults to — a tall chart card is
            far easier to widen from its left edge than to drag a 20px corner
            across the board. The north edge is left out on purpose: the
            header is the drag handle, and a resize strip on top of it would
            fight the drag. Minimums come from the registry (`minW`/`minH`).
          */
          resizeConfig={{ handles: ['se', 'sw', 'e', 'w', 's'] }}
          onLayoutChange={(next) =>
            onLayoutChange(
              next
                .filter((item) => isWidgetId(item.i))
                .map((item) => ({
                  i: item.i as WidgetId,
                  x: item.x,
                  y: item.y,
                  w: item.w,
                  h: item.h,
                })),
            )
          }
        >
          {specs.map((spec, index) => (
            <div
              key={spec.id}
              style={cascade.styleFor(index)}
              className={cascade.active ? 'animate-fade-in-up cascade-delay' : ''}
            >
              <WidgetFrame title={WIDGETS[spec.id].title} menu={widgetMenu(spec.id)}>
                {renderWidget(spec.id)}
              </WidgetFrame>
            </div>
          ))}
        </GridLayout>
      ) : null}
    </div>
  );
}

function NoRepo({ tabs }: { tabs?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {tabs ? (
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
          <DashboardTabs />
        </header>
      ) : null}
      <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-3 text-center">
        <BrandMark className="h-14 w-14 opacity-80" />
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Select a repository on the left to see its history, contributors and CI at a glance.
        </p>
      </div>
    </div>
  );
}
