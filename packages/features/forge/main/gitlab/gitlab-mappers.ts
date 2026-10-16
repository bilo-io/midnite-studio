import type {
  ForgeChecksRollup,
  ForgeIssueState,
  ForgePullState,
  ForgeReviewDecision,
  ForgeRunConclusion,
  ForgeRunStatus,
} from '@midnite/studio-shared';

/**
 * GitLab's vocabulary, mapped onto GitHub's — the phase's own settled
 * decision (see the phase doc's "GitHub's vocabulary stays canonical").
 * Code with a test, not a comment, per Theme E's own checklist item.
 */

/** A pipeline or job's `status`, onto `{status, conclusion}`. */
export function mapPipelineStatus(status: string): {
  status: ForgeRunStatus;
  conclusion: ForgeRunConclusion | null;
} {
  switch (status) {
    case 'created':
      return { status: 'queued', conclusion: null };
    case 'waiting_for_resource':
      // Held by a resource group, the closest GitLab equivalent of GitHub's
      // environment-protection `waiting`.
      return { status: 'waiting', conclusion: null };
    case 'preparing':
      return { status: 'queued', conclusion: null };
    case 'pending':
      return { status: 'pending', conclusion: null };
    case 'running':
      return { status: 'in_progress', conclusion: null };
    case 'success':
      return { status: 'completed', conclusion: 'success' };
    case 'failed':
      return { status: 'completed', conclusion: 'failure' };
    case 'canceled':
      // Kept as GitHub's own spelling — `cancelled`, not `canceled`.
      return { status: 'completed', conclusion: 'cancelled' };
    case 'skipped':
      return { status: 'completed', conclusion: 'skipped' };
    case 'manual':
      // A job held on a person's click — GitHub's closest completed-with-a-
      // human-gate arm is `action_required`, but this job has not completed,
      // so `waiting` (not-finished) is the honest status, same as `manual`'s
      // sibling `waiting_for_resource`.
      return { status: 'waiting', conclusion: null };
    case 'scheduled':
      return { status: 'pending', conclusion: null };
    default:
      // An unrecognised future status reads as "still going" rather than
      // silently vanishing from the list.
      return { status: 'queued', conclusion: null };
  }
}

/** A merge request's `state` (`opened`/`closed`/`locked`/`merged`), onto
 *  `ForgePullState`'s three arms. `locked` is a still-open MR whose discussion
 *  is frozen for editing — closest mapped as `open`, since it has neither
 *  closed nor merged. */
export function mapMergeRequestState(state: string): ForgePullState {
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

/** An issue's `state` (`opened`/`closed`), onto `ForgeIssueState`. */
export function mapIssueState(state: string): ForgeIssueState {
  return state === 'closed' ? 'closed' : 'open';
}

/**
 * `GET .../approvals` onto `ForgeReviewDecision`.
 *
 * **GitLab has no `CHANGES_REQUESTED`.** An unapproval is not a request for
 * changes — see the phase doc's Decisions — so that arm is unreachable here
 * by construction, not by omission.
 */
export function mapApprovalDecision(
  approved: boolean,
  approvalsRequired: number,
): ForgeReviewDecision | null {
  if (approved) return 'APPROVED';
  if (approvalsRequired > 0) return 'REVIEW_REQUIRED';
  return null;
}

/** The embedded `pipeline.status` a merge-request listing already carries,
 *  reduced to the one-level-up traffic light `ForgePull.checks` wants — the
 *  same rollup `rollupChecks` computes for GitHub, but read from a status
 *  GitLab's list endpoint hands over for free rather than a second call. */
export function mapChecksRollup(pipelineStatus: string | null | undefined): ForgeChecksRollup | null {
  if (!pipelineStatus) return null;
  const { status, conclusion } = mapPipelineStatus(pipelineStatus);
  if (status !== 'completed') return 'pending';
  if (conclusion === 'success' || conclusion === 'skipped' || conclusion === 'neutral') return 'passing';
  return 'failing';
}
