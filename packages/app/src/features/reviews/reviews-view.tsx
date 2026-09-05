import { useActiveWorktree } from '../../services/use-status';
import { ReviewsList } from './reviews-list';

/**
 * The Reviews view: the pull requests on the repo's GitHub remote, grouped into
 * the three questions a reviewer arrives with — My Requests, Awaiting My
 * Review, All Pull Requests — beside the selected one's detail (Theme C's
 * `PrDetail`).
 *
 * Each group is its own lazy `gh pr list`, so the view costs nothing on arrival
 * and a reader who only ever opens one scope only ever pays for one. The
 * fetching, paging and per-group empty states all live in `ReviewsList` with
 * the groups they belong to; what is left here is the one question this
 * component can answer on its own — which repository is being asked about.
 *
 * Refresh is explicit, matching every other forge surface — no polling.
 *
 * That is also why the house ladder — error → empty → skeleton → content
 * (`components/skeleton.tsx`) — is not restated here: `ReviewsList` runs it
 * per group, which is the only level it can be run at, since three groups
 * fetch independently and can be in three different states at once. Phase 60
 * Theme C's addition there was the transport-error rung, the one an envelope
 * that never arrives cannot carry.
 */
export function ReviewsView() {
  const { repoId } = useActiveWorktree();

  if (repoId === null) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8">
        <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
          Select a repository to see its pull requests.
        </p>
      </div>
    );
  }

  return <ReviewsList repoId={repoId} />;
}
