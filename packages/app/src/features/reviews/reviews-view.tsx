import { useEffect, useState } from 'react';

import { useForgePulls, useRefreshForge } from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';
import { ReviewsList } from './reviews-list';

const PULLS_PAGE_SIZE = 20;
/** `ForgeListRequest`'s own zod ceiling — asking past it is a validation error, not a bigger page. */
const PULLS_PAGE_MAX = 100;

/**
 * The Reviews view: every pull request on the repo's GitHub remote,
 * filterable by state, author and title/branch text, beside its detail
 * (Theme C's `PrDetail`) — the same list-plus-detail shape the Actions view
 * already has.
 *
 * Refresh is explicit, matching every other forge surface — no polling.
 */
export function ReviewsView() {
  const { repoId } = useActiveWorktree();
  const [limit, setLimit] = useState(PULLS_PAGE_SIZE);

  // A page size grown for one repository is not a promise about the next.
  useEffect(() => {
    setLimit(PULLS_PAGE_SIZE);
  }, [repoId]);

  // `all`, not the hook's own `open` default — the status tabs below are the
  // filter, and `--state open --limit N` would cap the page at N open PRs
  // before this view ever got a chance to also offer Draft/Merged/Closed.
  const pulls = useForgePulls(repoId, repoId !== null, limit, 'all');
  const refresh = useRefreshForge(repoId);

  if (repoId === null) {
    return <Notice>Select a repository to see its pull requests.</Notice>;
  }

  /*
    Deliberately NOT an early return here, unlike Actions. A PR already
    selected from the sidebar has to keep showing its `PrDetail` even when
    THIS listing can't refresh — `gh` going offline mid-session should not
    blank out a pull request the reader already has open. `ReviewsList`
    renders the CLI hint / error in its own list pane instead, and
    `PrDetail`'s three tabs already report "not ready" per tab on their own.
  */
  const cli = pulls.data?.cli;
  const cliHint =
    cli !== undefined && cli.reason !== 'ready' ? cli.hint || 'The GitHub CLI is unavailable.' : null;
  const error = cliHint === null ? (pulls.data?.error ?? null) : null;

  const rows = pulls.data?.pulls ?? [];

  return (
    <ReviewsList
      repoId={repoId}
      rows={rows}
      isFetching={pulls.isFetching}
      onRefresh={refresh}
      cliHint={cliHint}
      error={error}
      /*
        `gh pr list` has no cursor — a page that came back full of `limit` rows
        might just be exactly that many, but the only way to find out is to ask
        wider. A page that came back short is the honest "that's everything".
      */
      canLoadMore={rows.length >= limit && limit < PULLS_PAGE_MAX}
      onLoadMore={() => setLimit((current) => Math.min(PULLS_PAGE_MAX, current + PULLS_PAGE_SIZE))}
    />
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
