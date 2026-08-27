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
