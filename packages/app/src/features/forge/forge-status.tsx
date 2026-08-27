import type { ForgeIssue, ForgeJob, ForgePull, ForgeRun } from '@midnite/git-shared';

/**
 * The status vocabulary shared by the Actions and Reviews surfaces.
 *
 * One module so a run row in the sidebar, the tab that opens from it, and the
 * branch dot all describe the same state with the same word and the same
 * colour. Three independent ternaries over `conclusion` is how "cancelled"
 * ends up red in one place and grey in another.
 */
export type ForgeTone = 'ok' | 'fail' | 'busy' | 'idle' | 'warn';

const TONE_CLASS: Record<ForgeTone, string> = {
  ok: 'bg-success/15 text-success',
  fail: 'bg-destructive/15 text-destructive',
  // Amber rather than the primary accent: the accent is spoken for by the
  // change-count pill, and two different meanings in one colour on adjacent
  // rows is worse than a third hue.
  busy: 'bg-amber-500/15 text-amber-500',
  warn: 'bg-amber-500/15 text-amber-500',
  idle: 'bg-muted text-muted-foreground',
};

export type ForgeStatus = { tone: ForgeTone; label: string };

/**
 * The five ways of not being finished.
 *
 * `waiting` is amber rather than the busy amber's sibling by accident — a job
 * held by an environment protection rule is waiting on a *person*, which is the
 * same call to action `action_required` makes, and rendering it as "Running"
 * would tell the user to wait for a machine that is waiting for them.
 */
const UNFINISHED: Record<Exclude<ForgeRun['status'], 'completed'>, ForgeStatus> = {
  queued: { tone: 'busy', label: 'Queued' },
  in_progress: { tone: 'busy', label: 'Running' },
  requested: { tone: 'busy', label: 'Requested' },
  pending: { tone: 'busy', label: 'Pending' },
  waiting: { tone: 'warn', label: 'Waiting for approval' },
};

/**
 * A run's state in one word.
 *
 * `skipped`, `neutral` and `stale` are deliberately `idle`, not failures — a
 * workflow that correctly declined to run is not a broken build, and painting
 * it red trains people to ignore red.
 */
export function runStatus(run: ForgeRun): ForgeStatus {
  return outcomeStatus(run.status, run.conclusion);
}

/**
 * Status and conclusion, in one word — the shared half of `runStatus`.
 *
 * A run, a job and a step answer to the same two enums, so they get one mapping
 * rather than three ternaries that can disagree about whether `cancelled` is
 * red. Taking the two fields rather than a whole run is what lets a job borrow
 * it without being dressed up as a run first.
 */
export function outcomeStatus(
  status: ForgeRun['status'],
  conclusion: ForgeRun['conclusion'],
): ForgeStatus {
  if (status !== 'completed') return UNFINISHED[status];
  switch (conclusion) {
    case 'success':
      return { tone: 'ok', label: 'Passed' };
    case 'failure':
    case 'startup_failure':
      return { tone: 'fail', label: 'Failed' };
    case 'timed_out':
      return { tone: 'fail', label: 'Timed out' };
    case 'action_required':
      return { tone: 'warn', label: 'Action required' };
    case 'cancelled':
      return { tone: 'idle', label: 'Cancelled' };
    case 'skipped':
      return { tone: 'idle', label: 'Skipped' };
    case 'neutral':
      return { tone: 'idle', label: 'Neutral' };
    case 'stale':
      return { tone: 'idle', label: 'Stale' };
    // A completed run with no conclusion is a shape the forge should not
    // produce; saying so beats inventing a verdict for it.
    default:
      return { tone: 'idle', label: 'Completed' };
  }
}

/**
 * A pull request's state in one word.
 *
 * Merged and closed win over everything: `reviewDecision`/`isDraft` describe
 * a PR that is still open, and reading them for one that isn't is how a
 * merged PR ends up rendering "Approved" — true of the review, but not the
 * thing this pill is answering now that Phase 20 fetches every state, not
 * just open. Draft wins next: a draft that has failing checks is still a
 * draft, and leading with "Failing" would ask for attention the author has
 * not requested yet.
 */
export function pullStatus(pull: ForgePull): ForgeStatus {
  if (pull.state === 'merged') return { tone: 'ok', label: 'Merged' };
  if (pull.state === 'closed') return { tone: 'idle', label: 'Closed' };
  if (pull.isDraft) return { tone: 'idle', label: 'Draft' };
  switch (pull.reviewDecision) {
    case 'APPROVED':
      return { tone: 'ok', label: 'Approved' };
    case 'CHANGES_REQUESTED':
      return { tone: 'fail', label: 'Changes requested' };
    case 'REVIEW_REQUIRED':
      return { tone: 'warn', label: 'Review required' };
    default:
      return { tone: 'idle', label: 'Open' };
  }
}

/** The checks rollup, when a PR has one. `null` renders nothing. */
export function checksStatus(pull: ForgePull): ForgeStatus | null {
  switch (pull.checks) {
    case 'passing':
      return { tone: 'ok', label: 'Checks passing' };
    case 'failing':
      return { tone: 'fail', label: 'Checks failing' };
    case 'pending':
      return { tone: 'busy', label: 'Checks running' };
    default:
      return null;
  }
}

export function StatusPill({
  status,
  className = '',
}: {
  status: ForgeStatus;
  className?: string;
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium leading-none ${TONE_CLASS[status.tone]} ${className}`}
    >
      {status.label}
    </span>
  );
}

/**
 * An issue's state in one word.
 *
 * Two arms, because an issue has two. The pill exists so an issue row reads
 * the same way as the run and pull rows above it rather than being the one
 * list in the sidebar with a bare title.
 */
export function issueStatus(issue: ForgeIssue): ForgeStatus {
  return issue.state === 'closed'
    ? { tone: 'idle', label: 'Closed' }
    : { tone: 'warn', label: 'Open' };
}

/**
 * A job's state in one word.
 *
 * A job and a run answer to the same two enums, so this is `runStatus` with a
 * narrower argument rather than a second opinion about what `skipped` means.
 */
export function jobStatus(job: ForgeJob): ForgeStatus {
  return outcomeStatus(job.status, job.conclusion);
}
