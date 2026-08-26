import { useMemo, useState } from 'react';

import { pickForgeRemote, type StatsWindow } from '@midnite/git-shared';
import { LayoutGrid, RefreshCw, Users } from 'lucide-react';
import GridLayout, { useContainerWidth, type LayoutItem } from 'react-grid-layout';

import { BrandMark } from '../../components/brand';
import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { MultiSelectMenu } from '../../components/multi-select-menu';
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
  inReadingOrder,
  useDashboardStore,
  type WidgetLayout,
} from '../../store/dashboard-store';
import { useUiStore } from '../../store/ui-store';
import { byCommits, scopeStats } from './dashboard-derive';
import {
  GRID_COLS,
  GRID_MARGIN,
  ROW_HEIGHT,
  isWidgetId,
  type WidgetId,
} from './widget-ids';
import { DRAG_HANDLE_CLASS, NO_DRAG_CLASS, WidgetFrame } from './widget-frame';
import { availableWidgets, needsChurn, renderableWidgets, WIDGETS } from './widget-registry';
import { ActivityWidget } from './widgets/activity-widget';
import { CalendarWidget } from './widgets/calendar-widget';
import { ContributorsWidget } from './widgets/contributors-widget';
import { IssuesWidget, PullsWidget, RunsWidget } from './widgets/forge-widgets';
import { HealthWidget } from './widgets/health-widget';

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
 */
const WINDOW_LABELS: Record<StatsWindow, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '1y': 'Last year',
  all: 'All time',
};

export function DashboardView() {
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const selectCommit = useUiStore((s) => s.selectCommit);

  const boards = useDashboardStore((s) => s.boards);
  const board = boardFor(boards, selectedRepoId);
  const setLayout = useDashboardStore((s) => s.setLayout);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const moveWidget = useDashboardStore((s) => s.moveWidget);
  const setAuthors = useDashboardStore((s) => s.setAuthors);
  const setWindow = useDashboardStore((s) => s.setWindow);
  const resetLayout = useDashboardStore((s) => s.resetLayout);

  const { data: remotes } = useRemotes(selectedRepoId);
  const hasForge = pickForgeRemote(remotes ?? [])?.forge?.kind === 'github';

  const layoutIds = useMemo(() => board.layout.map((item) => item.i), [board.layout]);
  const specs = useMemo(
    () => renderableWidgets(layoutIds, hasForge),
    [layoutIds, hasForge],
  );
  const onBoard = useMemo(() => new Set(specs.map((spec) => spec.id)), [specs]);

  const withChurn = needsChurn(layoutIds);
  const { data: rawStats, isFetching: statsFetching } = useRepoStats(
    selectedRepoId,
    board.window,
    withChurn,
  );
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
  const dialogs = useDialogs();

  const authorOptions = useMemo(
    () =>
      byCommits(rawStats?.contributors ?? []).map((person) => ({
        value: person.email,
        label: person.name,
        keywords: person.email,
        meta: <span className="tabular-nums">{person.commits}</span>,
      })),
    [rawStats?.contributors],
  );

  if (!selectedRepoId) return <NoRepo />;

  const repoId = selectedRepoId;

  const toggleAuthor = (email: string): void =>
    setAuthors(
      repoId,
      board.authors.includes(email)
        ? board.authors.filter((value) => value !== email)
        : [...board.authors, email],
    );

  /**
   * The board's own menu: which widgets are on it, and Reset layout.
   *
   * Only widgets this repository could ever populate appear — a repo with no
   * GitHub remote offers no PRs, issues or runs entry at all, rather than three
   * entries that add a permanently empty tile.
   */
  const boardMenu: MenuItem[] = [
    ...availableWidgets(hasForge).map((spec) => ({
      label: `${onBoard.has(spec.id) ? '✓ ' : ''}${spec.title}`,
      onSelect: () =>
        onBoard.has(spec.id) ? removeWidget(repoId, spec.id) : addWidget(repoId, spec.id),
    })),
    { type: 'separator' as const },
    { label: 'Reset layout', onSelect: () => resetLayout(repoId) },
  ];

  const ordered = inReadingOrder(board.layout);
  const widgetMenu = (id: WidgetId): MenuItem[] => {
    const index = ordered.findIndex((item) => item.i === id);
    return [
      {
        label: 'Move up',
        onSelect: () => moveWidget(repoId, id, -1),
        disabled: index <= 0,
      },
      {
        label: 'Move down',
        onSelect: () => moveWidget(repoId, id, 1),
        disabled: index === -1 || index >= ordered.length - 1,
      },
      { type: 'separator' as const },
      { label: 'Remove widget', onSelect: () => removeWidget(repoId, id), danger: true },
    ];
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <h2 className="mr-auto text-sm font-semibold tracking-tight">Dashboard</h2>

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

        <MultiSelectMenu
          options={authorOptions}
          selected={board.authors}
          onChange={(next) => setAuthors(repoId, next)}
          icon={<Users aria-hidden className="h-3.5 w-3.5" />}
          allLabel="All authors"
          searchPlaceholder="Filter authors…"
          emptyLabel="No contributors in this window."
          label="Filter the board by author"
          summarise={(count) => `${count} authors`}
        />

        <IconButton
          icon={RefreshCw}
          label="Recompute repository statistics"
          size="sm"
          busy={statsFetching}
          onClick={refreshStats}
        />

        <IconButton
          icon={LayoutGrid}
          label="Widgets and layout"
          size="sm"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            dialogs.openMenu(
              { clientX: event.clientX || rect.right, clientY: event.clientY || rect.bottom },
              boardMenu,
            );
          }}
        />
      </header>

      <Board
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
              return <PullsWidget result={pulls.data} isFetching={pulls.isFetching} />;
            case 'issues':
              return <IssuesWidget result={issues.data} isFetching={issues.isFetching} />;
            case 'runs':
              return <RunsWidget result={runs.data} isFetching={runs.isFetching} />;
            case 'health':
              return <HealthWidget stats={stats} loading={statsFetching && !rawStats} />;
          }
        }}
        widgetMenu={widgetMenu}
      />
    </div>
  );
}

function Board({
  specs,
  layout,
  onLayoutChange,
  renderWidget,
  widgetMenu,
}: {
  specs: readonly { id: WidgetId; title: string; minW: number; minH: number }[];
  layout: readonly WidgetLayout[];
  onLayoutChange: (next: WidgetLayout[]) => void;
  renderWidget: (id: WidgetId) => React.ReactNode;
  widgetMenu: (id: WidgetId) => MenuItem[];
}) {
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

  if (specs.length === 0) {
    return (
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-4">
        <p className="text-sm text-muted-foreground">
          No widgets on this board. Use <span className="font-medium">Widgets and layout</span> to
          add some.
        </p>
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
          {specs.map((spec) => (
            <div key={spec.id}>
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

function NoRepo() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <BrandMark className="h-14 w-14 opacity-80" />
      <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Select a repository on the left to see its history, contributors and CI at a glance.
      </p>
    </div>
  );
}
