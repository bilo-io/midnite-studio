import type {
  ForgeChecksRollup,
  ForgeIssueState,
  ForgePullState,
  ForgeReviewDecision,
  ForgeRunConclusion,
  ForgeRunStatus,
} from '@midnite/studio-shared';

/**
 * Azure DevOps's vocabulary, mapped onto GitHub's — the phase's own settled
 * decision (see the phase doc's "GitHub's vocabulary stays canonical"),
 * applied to the provider whose own vocabulary disagrees the most: work
 * items instead of issues, a numeric review vote instead of an enum, and a
 * build result that is genuinely three-valued (`succeeded` /
 * `partiallySucceeded` / `failed`) where GitHub's checks rollup is two.
 */

/** A pull request's `status` (`active`/`completed`/`abandoned`), onto
 *  `ForgePullState`'s three arms. */
export function mapPullState(status: string): ForgePullState {
  if (status === 'completed') return 'merged';
  if (status === 'abandoned') return 'closed';
  return 'open';
}

/** `mergeStatus` onto GitHub's `mergeable` word (`ForgePullDetail.mergeable`) —
 *  `queued`/`notSet` is "still computing", the honest `UNKNOWN` GitHub itself
 *  reports mid-check, not a `false`. */
export function mapMergeable(mergeStatus: string | null): string | null {
  switch (mergeStatus) {
    case 'succeeded':
      return 'MERGEABLE';
    case 'conflicts':
    case 'rejectedByPolicy':
    case 'failure':
      return 'CONFLICTING';
    case 'queued':
    case 'notSet':
      return 'UNKNOWN';
    default:
      return null;
  }
}

/**
 * A build's `status` + `result` onto `{status, conclusion}` — the same
 * two-field split `mapPipelineStatus` makes for GitLab and Bitbucket.
 *
 * `partiallySucceeded` has no clean GitHub analogue: some tasks in the
 * pipeline failed but the build was not hard-failed. `neutral` — GitHub's own
 * "ran, did not pass, is not a failure" arm — is the honest landing spot,
 * not `success` (which would hide the failed tasks) and not `failure`
 * (which would overstate a build the pipeline itself did not fail).
 */
export function mapBuildStatus(
  status: string,
  result: string | null,
): { status: ForgeRunStatus; conclusion: ForgeRunConclusion | null } {
  switch (status) {
    case 'notStarted':
    case 'postponed':
      return { status: 'queued', conclusion: null };
    case 'inProgress':
    case 'cancelling':
      return { status: 'in_progress', conclusion: null };
    case 'completed':
      break;
    default:
      return { status: 'queued', conclusion: null };
  }

  switch (result) {
    case 'succeeded':
      return { status: 'completed', conclusion: 'success' };
    case 'partiallySucceeded':
      return { status: 'completed', conclusion: 'neutral' };
    case 'failed':
      return { status: 'completed', conclusion: 'failure' };
    case 'canceled':
      return { status: 'completed', conclusion: 'cancelled' };
    default:
      return { status: 'completed', conclusion: null };
  }
}

/** A work item type's own state → the fixed five-value category set every
 *  Azure process template maps onto (`azure-client.ts`'s `stateCategoriesFor`
 *  resolves the category; this just narrows it to open/closed, per the phase
 *  doc's own instruction). `Resolved` is deliberately left `'open'` — a
 *  team's own workflow still has a step after it, unlike `Completed`. */
export function mapWorkItemStateCategory(category: string | null): ForgeIssueState {
  return category === 'Completed' || category === 'Removed' ? 'closed' : 'open';
}

/**
 * One reviewer's `vote` — Azure's numeric scale, unpacked. Not exported
 * beyond this module's own `mapReviewDecision`; the phase doc calls out `5`
 * and `-5` as the two values "a naive mapper gets wrong", so this table names
 * every one of them rather than folding the scale into a sign check.
 */
type ReviewerVote = 'approved' | 'approved-with-suggestions' | 'no-vote' | 'waiting-for-author' | 'rejected';

function classifyVote(vote: number): ReviewerVote {
  if (vote === 10) return 'approved';
  if (vote === 5) return 'approved-with-suggestions';
  if (vote === -5) return 'waiting-for-author';
  if (vote === -10) return 'rejected';
  return 'no-vote';
}

/**
 * A pull request's `reviewers[]` onto `ForgeReviewDecision`.
 *
 * `-10` (rejected) is Azure's only true block, and is the one vote that maps
 * onto `CHANGES_REQUESTED` — a naive `vote < 0` check would also catch `-5`
 * ("waiting for author"), which is a soft nudge a reviewer leaves themselves,
 * not a request the PR cannot proceed without. `5` ("approved with
 * suggestions") counts as a real approval, the same way GitHub's own
 * `APPROVED` review counts regardless of how many comments it carries — the
 * mistake the phase doc warns about is reading `5` as "not really approved".
 * A required reviewer sitting at `0`/`-5` blocks completion under Azure's own
 * branch policy even though it is not a reject, which is what
 * `REVIEW_REQUIRED` is for.
 */
export function mapReviewDecision(
  reviewers: readonly { vote: number; isRequired: boolean }[],
): ForgeReviewDecision | null {
  let rejected = false;
  let approved = false;
  let requiredPending = false;

  for (const reviewer of reviewers) {
    const kind = classifyVote(reviewer.vote);
    if (kind === 'rejected') rejected = true;
    if (kind === 'approved' || kind === 'approved-with-suggestions') approved = true;
    if (reviewer.isRequired && reviewer.vote <= 0) requiredPending = true;
  }

  if (rejected) return 'CHANGES_REQUESTED';
  if (requiredPending) return 'REVIEW_REQUIRED';
  if (approved) return 'APPROVED';
  return null;
}

/** The rollup a listing's embedded latest-build status gives for free, the
 *  same one-level-up traffic light `mapChecksRollup` computes for GitLab. */
export function mapChecksRollup(buildStatus: string | null, buildResult: string | null): ForgeChecksRollup | null {
  if (!buildStatus) return null;
  const { status, conclusion } = mapBuildStatus(buildStatus, buildResult);
  if (status !== 'completed') return 'pending';
  if (conclusion === 'success' || conclusion === 'neutral') return 'passing';
  return 'failing';
}
