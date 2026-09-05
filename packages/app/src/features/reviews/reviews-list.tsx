import { useCallback, useEffect, useMemo, useState } from 'react';

import { Tabs, type TabOption } from '@bilo-io/ui';
import type { ForgePull, ForgePullScope } from '@midnite/studio-shared';
import { LuRefreshCw, LuSearch, LuUsers } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';
import { Spinner } from '../../components/skeleton';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { TreeSection } from '../../components/tree-section';
import { UserAvatar } from '../../components/user-avatar';
import { cascadeStyle } from '../../lib/cascade';
import { formatNumber } from '../../lib/format-number';
import { useForgePulls, useRefreshForge } from '../../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { useReviewsStore } from '../../store/reviews-store';
import { checksStatus, pullStatus, StatusPill } from '../forge/forge-status';
import { PrDetail } from './pr-detail';
import { REVIEW_GROUPS, type ReviewGroup } from './review-groups';
import { PrDetailSkeleton, PullListSkeleton } from './reviews-skeletons';

const PULLS_PAGE_SIZE = 20;
/** `ForgeListRequest`'s own zod ceiling — asking past it is a validation error, not a bigger page. */
const PULLS_PAGE_MAX = 100;

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

/** What the toolbar narrows every group by, as one predicate the groups share. */
type PullFilter = (pull: ForgePull) => boolean;

/** What one expanded group reports up about its own listing. */
type GroupState = { rows: readonly ForgePull[]; isFetching: boolean };

/**
 * The Reviews view's body: three lazy, scoped pull-request listings beside the
 * selected PR's detail (Theme C's `PrDetail`) — the same list-plus-detail split
 * the Actions view has, with the tab/author/search toolbar as the list pane's
 * own header.
 *
 * The toolbar filters ACROSS the groups rather than inside one: a status tab or
 * a search term is a question about pull requests, not about a scope, and
 * repeating the controls three times would be three places to set the same
 * thing. The groups answer "whose", the toolbar answers "which".
 */
export function ReviewsList({ repoId }: { repoId: string }) {
  const [tab, setTab] = useState<StatusTab>('open');
  const [authors, setAuthors] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  /*
    What each expanded group has fetched, and whether it is still fetching,
    reported up as it lands.

    The author menu, the fallback selection and the detail pane's own
    "something is coming" are all questions about every row on screen, and no
    single group can answer any of them — so the groups own the fetching and
    this owns the union. A collapsed group reports nothing, which is what keeps
    the menu honest: it offers the authors you can see.
  */
  const [loaded, setLoaded] = useState<Partial<Record<ForgePullScope, GroupState>>>({});
  const publish = useCallback((scope: ForgePullScope, state: GroupState | null) => {
    setLoaded((current) => {
      const previous = current[scope];
      if (state === null) {
        if (previous === undefined) return current;
        const next = { ...current };
        delete next[scope];
        return next;
      }
      if (previous?.rows === state.rows && previous.isFetching === state.isFetching) return current;
      return { ...current, [scope]: state };
    });
  }, []);

  // Another repository's pull requests are not this one's, and the groups
  // remount their queries rather than their components when `repoId` changes.
  useEffect(() => {
    setLoaded({});
  }, [repoId]);

  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const list = useResizable({
    size: layout.reviewsListWidth,
    onSize: (value) => setLayout('reviewsListWidth', value),
    initial: DEFAULT_LAYOUT.reviewsListWidth,
    axis: 'x',
    ...LAYOUT_BOUNDS.reviewsListWidth,
  });

  const refresh = useRefreshForge(repoId);
  const selectPull = useReviewsStore((s) => s.selectPull);
  const stored = useReviewsStore((s) => s.selectedPull[repoId] ?? null);

  /*
    Deduplicated by PR number before anything counts it.

    The same pull request is legitimately in two groups at once — one you opened
    that someone asked you to review is in both My Requests and All Pull
    Requests — and an author tally that counted it twice would be a number the
    list can never match. Derived from every fetched row rather than the
    filtered ones, so switching tabs never yanks an author out of a menu you
    already opened.
  */
  const visibleRows = useMemo(() => {
    const byNumber = new Map<number, ForgePull>();
    for (const group of REVIEW_GROUPS) {
      for (const pull of loaded[group.scope]?.rows ?? []) byNumber.set(pull.number, pull);
    }
    return [...byNumber.values()];
  }, [loaded]);

  /** Whether any expanded group is still out — see the detail pane below. */
  const fetching = REVIEW_GROUPS.some((group) => loaded[group.scope]?.isFetching === true);

  const authorOptions = useMemo<MultiSelectOption[]>(() => {
    const counts = new Map<string, number>();
    for (const pull of visibleRows) {
      if (!pull.author) continue;
      counts.set(pull.author, (counts.get(pull.author) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([author, count]) => ({
        value: author,
        label: author,
        meta: (
          <span className="tabular-nums text-[10px] text-muted-foreground">
            {formatNumber(count)}
          </span>
        ),
      }));
  }, [visibleRows]);

  const needle = query.trim().toLowerCase();
  const filter = useCallback<PullFilter>(
    (pull) =>
      matchesTab(pull, tab) &&
      (authors.length === 0 || authors.includes(pull.author)) &&
      (needle.length === 0 ||
        pull.title.toLowerCase().includes(needle) ||
        pull.headBranch.toLowerCase().includes(needle)),
    [tab, authors, needle],
  );

  const matched = visibleRows.filter(filter);

  /*
    The stored selection wins outright, and unlike the flat list this replaces
    it is NOT conditioned on the PR still being in view.

    `PrDetail` fetches the pull request by number on its own, so a selection
    made in the sidebar has to survive arriving here with every group collapsed
    — there is nothing loaded yet for it to be "in". The fallback is the first
    row of the first expanded group that has one, in `REVIEW_GROUPS` order, so
    expanding a group fills the detail pane rather than leaving it blank.
  */
  const fallback =
    REVIEW_GROUPS.map((group) => (loaded[group.scope]?.rows ?? []).filter(filter)[0]).find(
      (pull) => pull !== undefined,
    ) ?? null;
  const selectedNumber = stored ?? fallback?.number ?? null;

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
            icon={<LuUsers aria-hidden className="h-3.5 w-3.5 shrink-0" />}
            allLabel="All authors"
            searchPlaceholder="Filter authors…"
            emptyLabel="No author matches."
            label="Filter pull requests by author"
            summarise={(n) => `${n} authors`}
          />

          {/*
            One refresh for all three groups, because that is what it does:
            `useRefreshForge` invalidates the repository's whole forge prefix,
            so a button per group would claim a precision it does not have.
          */}
          <IconButton
            icon={LuRefreshCw}
            label="Refresh pull requests"
            size="sm"
            onClick={refresh}
          />
        </div>

        <div className="relative shrink-0 border-b border-border px-2 py-1.5">
          <LuSearch
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
            {formatNumber(matched.length)}
          </span>
        </div>

        {/*
          Named for the specs that have to tell these apart from the sidebar's
          own copy of the same three groups — both are on screen in this view,
          with the same headings, and the collapsed one is still in the DOM.
        */}
        <div data-testid="reviews-groups" className="min-h-0 flex-1 overflow-y-auto py-1">
          {REVIEW_GROUPS.map((group) => (
            <ReviewGroupSection
              key={group.scope}
              repoId={repoId}
              group={group}
              filter={filter}
              filtering={tab !== 'open' || authors.length > 0 || needle.length > 0}
              selectedNumber={selectedNumber}
              onSelect={(number) => selectPull(repoId, number)}
              onRows={publish}
            />
          ))}
        </div>
      </div>

      <ResizeHandle resizable={list} axis="x" label="Resize the pull request list" />

      {selectedNumber === null ? (
        /*
          Mid-fetch this column is about to hold a pull request — the group that
          is out will select its first row when it lands — so it shows the shape
          of one. With nothing in flight there is genuinely nothing coming, and
          a skeleton would be promising a PR nobody has asked for: every group
          is shut, or every expanded one is empty. The sentence says which.
        */
        fetching ? (
          <PrDetailSkeleton />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center p-8">
            <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
              Open one of the groups on the left to see its pull requests.
            </p>
          </div>
        )
      ) : (
        <PrDetail repoId={repoId} number={selectedNumber} />
      )}
    </div>
  );
}

/**
 * One scoped listing, as a collapsible group in the list pane.
 *
 * Closed on arrival and `enabled: false` until opened — the same rate-limit
 * gate the sidebar's forge sections have always applied, and the reason the
 * whole view now costs nothing to land on. Its own `limit` too: a page grown
 * for All Pull Requests is not a promise about My Requests, and `gh pr list`
 * has no cursor, so "Load more" is a second, wider fetch under a new key.
 *
 * Fold state lives in `useReviewsStore` rather than here so that the groups you
 * opened survive a trip through another view and back, which local state — torn
 * down with the component — would not.
 */
function ReviewGroupSection({
  repoId,
  group,
  filter,
  filtering,
  selectedNumber,
  onSelect,
  onRows,
}: {
  repoId: string;
  group: ReviewGroup;
  filter: PullFilter;
  /** Whether the toolbar is narrowing anything — which of two empties to say. */
  filtering: boolean;
  selectedNumber: number | null;
  onSelect: (number: number) => void;
  onRows: (scope: ForgePullScope, state: GroupState | null) => void;
}) {
  const open = useReviewsStore((s) => s.openGroups[group.scope] ?? false);
  const toggleGroup = useReviewsStore((s) => s.toggleGroup);
  const [limit, setLimit] = useState(PULLS_PAGE_SIZE);

  // A page size grown for one repository is not a promise about the next.
  useEffect(() => {
    setLimit(PULLS_PAGE_SIZE);
  }, [repoId]);

  /*
    `all`, not the hook's own `open` default — the status tabs above are the
    filter, and `--state open --limit N` would cap the page at N open PRs
    before this group ever got a chance to also offer Draft/Merged/Closed.
  */
  const pulls = useForgePulls(repoId, open, limit, 'all', group.scope);

  const rows = useMemo(() => pulls.data?.pulls ?? [], [pulls.data]);
  const isFetching = pulls.isFetching;
  useEffect(() => {
    onRows(group.scope, open ? { rows, isFetching } : null);
  }, [onRows, group.scope, open, rows, isFetching]);
  // A group unmounting takes its rows out of the union with it.
  useEffect(() => () => onRows(group.scope, null), [onRows, group.scope]);

  /*
    Everything we can actually assert comes first, and the skeleton is reached
    only once the group has nothing true to say yet. `rows.length === 0`
    separates the two silences a fetch can end in — a scope with no pull
    requests, and toolbar filters that match none of the ones it has — and
    neither of those is a loading state.
  */
  const cli = pulls.data?.cli;
  const cliHint =
    cli !== undefined && cli.reason !== 'ready'
      ? cli.hint || 'The GitHub CLI is unavailable.'
      : null;
  const error = cliHint === null ? (pulls.data?.error ?? null) : null;
  const filtered = rows.filter(filter);
  /*
    No number until there is one to give.

    An open group whose first fetch is still out has `rows.length === 0`, and
    printing that as "0" is a claim — the heading would read "All Pull Requests
    0" for as long as `gh` takes to answer, and then change its mind. Omitting
    the count is the honest shape for "not known yet"; `TreeSection` draws
    nothing at all for `undefined`.
  */
  const answered = pulls.data !== undefined;

  return (
    <TreeSection
      title={group.title}
      count={open && answered ? filtered.length : undefined}
      collapsible
      open={open}
      onToggle={() => toggleGroup(group.scope)}
      depth={0}
      hideWhenEmpty={false}
    >
      {cliHint !== null ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{cliHint}</p>
      ) : error !== null ? (
        <p className="px-3 py-2 text-xs text-destructive">{error}</p>
      ) : isFetching && rows.length === 0 ? (
        <PullListSkeleton />
      ) : filtered.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {rows.length === 0 || !filtering ? group.empty : 'No pull requests match these filters.'}
        </p>
      ) : (
        <ul aria-label={group.title} className="py-0.5">
          {filtered.map((pull, index) => (
            <li key={pull.number}>
              <PullRow
                pull={pull}
                index={index}
                selected={pull.number === selectedNumber}
                onSelect={() => onSelect(pull.number)}
              />
            </li>
          ))}
          {/*
            `gh pr list` has no cursor — a page that came back full of `limit`
            rows might just be exactly that many, but the only way to find out
            is to ask wider. A page that came back short is the honest "that's
            everything".
          */}
          {rows.length >= limit && limit < PULLS_PAGE_MAX ? (
            <li className="px-2 py-2">
              <button
                type="button"
                onClick={() =>
                  setLimit((current) => Math.min(PULLS_PAGE_MAX, current + PULLS_PAGE_SIZE))
                }
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
    </TreeSection>
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
        {pull.author ? (
          <span className="inline-flex shrink-0 items-center gap-1">
            <span>·</span>
            <UserAvatar login={pull.author} size={14} detail="PR author" />
            <span className="truncate">{pull.author}</span>
          </span>
        ) : null}
      </span>
    </button>
  );
}
