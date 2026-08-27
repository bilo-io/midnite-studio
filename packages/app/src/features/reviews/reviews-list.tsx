import { useMemo, useState } from 'react';

import { Tabs, type TabOption } from '@bilo-io/ui';
import type { ForgePull } from '@midnite/git-shared';
import { RefreshCw, Search, Users } from 'lucide-react';

import { IconButton } from '../../components/icon-button';
import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';
import { Spinner } from '../../components/skeleton';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { cascadeStyle } from '../../lib/cascade';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { useReviewsStore } from '../../store/reviews-store';
import { checksStatus, pullStatus, StatusPill } from '../forge/forge-status';
import { PrDetail } from './pr-detail';
import { PrDetailSkeleton, PullListSkeleton } from './reviews-skeletons';

type StatusTab = 'all' | 'open' | 'draft' | 'merged' | 'closed';

const TABS: TabOption<StatusTab>[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
];

/**
 * Draft wins over state, matching `pullStatus`'s own ordering: a draft PR is
 * still `state: 'open'` on the wire, so the Open tab excludes it explicitly
 * rather than showing every draft twice.
 */
function matchesTab(pull: ForgePull, tab: StatusTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'open':
      return pull.state === 'open' && !pull.isDraft;
    case 'draft':
      return pull.isDraft;
    case 'merged':
      return pull.state === 'merged';
    case 'closed':
      return pull.state === 'closed';
  }
}

/**
 * The Reviews view's body: a filterable PR list beside its detail (Theme C's
 * `PrDetail`) — the same list-plus-detail split the Actions view already has,
 * with the tab/author/search toolbar as the list pane's own header.
 */
export function ReviewsList({
  repoId,
  rows,
  isFetching,
  onRefresh,
  cliHint,
  error,
  canLoadMore,
  onLoadMore,
}: {
  repoId: string;
  rows: readonly ForgePull[];
  isFetching: boolean;
  onRefresh: () => void;
  /** Set when `gh` is missing or signed out — replaces the row list, not the detail pane. */
  cliHint: string | null;
  /** Set when the listing itself failed despite a ready CLI. */
  error: string | null;
  canLoadMore: boolean;
  onLoadMore: () => void;
}) {
  const [tab, setTab] = useState<StatusTab>('open');
  const [authors, setAuthors] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const list = useResizable({
    size: layout.reviewsListWidth,
    onSize: (value) => setLayout('reviewsListWidth', value),
    initial: DEFAULT_LAYOUT.reviewsListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.reviewsListWidth,
  });

  const selectPull = useReviewsStore((s) => s.selectPull);
  const stored = useReviewsStore((s) => s.selectedPull[repoId] ?? null);

  /*
    Derived from every fetched row, not just the tab-filtered ones — so
    switching tabs never yanks an author out of a menu you already opened,
    the same "selection survives narrowing" rule `AuthorFilter` follows for
    the graph.
  */
  const authorOptions = useMemo<MultiSelectOption[]>(() => {
    const counts = new Map<string, number>();
    for (const pull of rows) {
      if (!pull.author) continue;
      counts.set(pull.author, (counts.get(pull.author) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([author, count]) => ({
        value: author,
        label: author,
        meta: <span className="tabular-nums text-[10px] text-muted-foreground">{count}</span>,
      }));
  }, [rows]);

  const needle = query.trim().toLowerCase();
  const filtered = rows.filter(
    (pull) =>
      matchesTab(pull, tab) &&
      (authors.length === 0 || authors.includes(pull.author)) &&
      (needle.length === 0 ||
        pull.title.toLowerCase().includes(needle) ||
        pull.headBranch.toLowerCase().includes(needle)),
  );

  /*
    The stored selection wins, but only while it is still in the filtered
    set — a PR selected from the sidebar under one tab has to survive
    switching tabs, but one that ages out of the current filter falls back to
    the top of whatever IS showing, the same rule `ActionsView` follows for
    `pickInitialRun`.
  */
  const selectedNumber =
    (stored !== null && filtered.some((pull) => pull.number === stored) ? stored : null) ??
    (filtered[0]?.number ?? null);

  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: list.current }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
          <Tabs options={TABS} value={tab} onChange={setTab} ariaLabel="Pull request status" />

          <MultiSelectMenu
            options={authorOptions}
            selected={authors}
            onChange={setAuthors}
            icon={<Users aria-hidden className="h-3.5 w-3.5 shrink-0" />}
            allLabel="All authors"
            searchPlaceholder="Filter authors…"
            emptyLabel="No author matches."
            label="Filter pull requests by author"
            summarise={(n) => `${n} authors`}
          />

          {/*
            The one spinner in this pane, and it is a spinner rather than a
            skeleton because the rows behind it are still good: a refetch over a
            listing already on screen must not blank it out. `IconButton` spins
            its own glyph and blocks the second click for us.
          */}
          <IconButton
            icon={RefreshCw}
            label="Refresh pull requests"
            size="sm"
            busy={isFetching}
            onClick={onRefresh}
          />
        </div>

        <div className="relative shrink-0 border-b border-border px-2 py-1.5">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title or branch…"
            aria-label="Search pull requests"
            className="h-6 w-full rounded-md border border-input bg-background pl-6 pr-2 text-xs outline-none focus-visible:border-primary"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 tabular-nums text-[11px] text-muted-foreground/70">
            {filtered.length}
          </span>
        </div>

        {/*
          The order is the point: everything we can actually assert comes first,
          and the skeleton is reached only once the pane has nothing true to say
          yet. `rows.length === 0` separates the two silences a fetch can end
          in — a repository with no pull requests, and filters that match none
          of the ones it has — and neither of those is a loading state.
        */}
        {cliHint !== null ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">{cliHint}</p>
        ) : error !== null ? (
          <p className="px-3 py-3 text-xs text-destructive">{error}</p>
        ) : isFetching && rows.length === 0 ? (
          <PullListSkeleton />
        ) : filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {rows.length === 0
              ? 'No pull requests yet.'
              : 'No pull requests match these filters.'}
          </p>
        ) : (
          <ul aria-label="Pull requests" className="min-h-0 flex-1 overflow-y-auto py-1">
            {filtered.map((pull, index) => (
              <li key={pull.number}>
                <PullRow
                  pull={pull}
                  index={index}
                  selected={pull.number === selectedNumber}
                  onSelect={() => selectPull(repoId, pull.number)}
                />
              </li>
            ))}
            {canLoadMore ? (
              <li className="px-2 py-2">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isFetching}
                  className="w-full rounded-md border border-border py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  {isFetching ? (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Spinner className="size-3" />
                      Loading…
                    </span>
                  ) : (
                    'Load more'
                  )}
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <ResizeHandle resizable={list} axis="x" label="Resize the pull request list" />

      {selectedNumber === null ? (
        /*
          Mid-fetch this column is about to hold a pull request, so it shows the
          shape of one; with the fetch done and still nothing selected, there is
          genuinely nothing coming and it says so.
        */
        isFetching ? (
          <PrDetailSkeleton />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center p-8">
            <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
              No pull requests to show for this repository.
            </p>
          </div>
        )
      ) : (
        <PrDetail repoId={repoId} number={selectedNumber} />
      )}
    </div>
  );
}

function PullRow({
  pull,
  index,
  selected,
  onSelect,
}: {
  pull: ForgePull;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const checks = checksStatus(pull);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      style={cascadeStyle(index)}
      className={`flex w-full animate-fade-in-up cascade-delay flex-col items-start gap-0.5 border-l-2 px-2 py-1.5 text-left text-[13px] transition-colors ${
        selected ? 'border-primary bg-accent/40' : 'border-transparent hover:bg-accent/20'
      }`}
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <StatusPill status={pullStatus(pull)} />
        {checks ? <StatusPill status={checks} /> : null}
        <span className="truncate">{pull.title}</span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
          #{pull.number}
        </span>
      </span>
      <span className="flex w-full min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="truncate">{pull.headBranch}</span>
        {pull.author ? <span className="shrink-0">· {pull.author}</span> : null}
      </span>
    </button>
  );
}
