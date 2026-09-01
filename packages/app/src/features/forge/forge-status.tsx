import type {
  ForgeIssue,
  ForgeJob,
  ForgePull,
  ForgeReviewState,
  ForgeRun,
} from '@midnite/studio-shared';
import {
  LuBan,
  LuCheck,
  LuCircleCheck,
  LuCircleDashed,
  LuCircleDot,
  LuCircleSlash,
  LuCircleX,
  LuClock,
  LuEllipsis,
  LuEye,
  LuGitMerge,
  LuGitPullRequest,
  LuGitPullRequestClosed,
  LuGitPullRequestDraft,
  LuHistory,
  LuLoaderCircle,
  LuMessageSquare,
  LuMessageSquareWarning,
  LuMinus,
  LuShieldAlert,
  LuSkipForward,
  LuTimerOff,
  LuTriangleAlert,
  LuX,
} from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import { Tooltip } from '../../components/tooltip';

/**
 * The status vocabulary shared by the Actions and Reviews surfaces.
 *
 * One module so a run row in the sidebar, the tab that opens from it, and the
 * branch dot all describe the same state with the same word, the same glyph and
 * the same colour. Three independent ternaries over `conclusion` is how
 * "cancelled" ends up red in one place and grey in another.
 */
export type ForgeTone = 'ok' | 'fail' | 'busy' | 'idle' | 'warn';

/** The chip's fill and text, for the statuses that keep their word. */
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

/** The bare glyph's colour, for the statuses that drop their word. */
const GLYPH_CLASS: Record<ForgeTone, string> = {
  ok: 'text-success',
  fail: 'text-destructive',
  busy: 'text-amber-500',
  warn: 'text-amber-500',
  idle: 'text-muted-foreground',
};

export type ForgeStatus = {
  tone: ForgeTone;
  /**
   * The state in one word — the glyph's accessible name and its tooltip, and
   * the visible text for the `withLabel` statuses.
   *
   * Every status still carries one even when it renders as a bare mark: the
   * word is what a screen reader announces and what a hover explains, so
   * dropping it from the object would make the glyph the only description of a
   * state there is.
   */
  label: string;
  icon: IconComponent;
  /**
   * Keep the word beside the glyph.
   *
   * Set on exactly the statuses that are asking a *person* for something —
   * "Action required", "Waiting for approval", "Review required". A verdict a
   * glyph can carry alone ("Passed", "Merged", "Cancelled") is noise repeated
   * down forty rows of a run list; a request for action that a reader has to
   * hover to discover is a request they will not see. So verdicts go quiet and
   * demands keep their chip, which is also what makes the loud ones legible —
   * in a list of bare marks, the one thing still spelled out is the one thing
   * wanting attention.
   */
  withLabel?: true;
  /** Turn the glyph, for the states that are genuinely in flight. */
  spin?: true;
};

/**
 * The five ways of not being finished.
 *
 * `waiting` is amber rather than the busy amber's sibling by accident — a job
 * held by an environment protection rule is waiting on a *person*, which is the
 * same call to action `action_required` makes, and rendering it as "Running"
 * would tell the user to wait for a machine that is waiting for them. It is
 * also why it is one of the three statuses that keeps its words.
 */
const UNFINISHED: Record<Exclude<ForgeRun['status'], 'completed'>, ForgeStatus> = {
  queued: { tone: 'busy', label: 'Queued', icon: LuClock },
  in_progress: { tone: 'busy', label: 'Running', icon: LuLoaderCircle, spin: true },
  requested: { tone: 'busy', label: 'Requested', icon: LuCircleDashed },
  pending: { tone: 'busy', label: 'Pending', icon: LuEllipsis },
  waiting: { tone: 'warn', label: 'Waiting for approval', icon: LuShieldAlert, withLabel: true },
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
 *
 * Every arm gets a glyph of its own, including the four that share a tone: a
 * bare mark is the *whole* of what most of these render, so two states drawn
 * the same are two states a reader cannot tell apart without hovering.
 */
export function outcomeStatus(
  status: ForgeRun['status'],
  conclusion: ForgeRun['conclusion'],
): ForgeStatus {
  if (status !== 'completed') return UNFINISHED[status];
  switch (conclusion) {
    case 'success':
      return { tone: 'ok', label: 'Passed', icon: LuCheck };
    case 'failure':
    case 'startup_failure':
      return { tone: 'fail', label: 'Failed', icon: LuX };
    case 'timed_out':
      return { tone: 'fail', label: 'Timed out', icon: LuTimerOff };
    case 'action_required':
      return { tone: 'warn', label: 'Action required', icon: LuTriangleAlert, withLabel: true };
    case 'cancelled':
      return { tone: 'idle', label: 'Cancelled', icon: LuBan };
    case 'skipped':
      return { tone: 'idle', label: 'Skipped', icon: LuSkipForward };
    case 'neutral':
      return { tone: 'idle', label: 'Neutral', icon: LuMinus };
    case 'stale':
      return { tone: 'idle', label: 'Stale', icon: LuHistory };
    // A completed run with no conclusion is a shape the forge should not
    // produce; saying so beats inventing a verdict for it.
    default:
      return { tone: 'idle', label: 'Completed', icon: LuCircleDot };
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
 *
 * The glyphs matter more here than anywhere else, because this pill is drawn
 * immediately beside `checksStatus` on every PR row and both halves go green at
 * once. So the states that are *about* the pull request take the forge's own
 * pull-request marks and the states that are about a reviewer's verdict take
 * conversational ones — anything but the ringed tick the checks rollup uses,
 * which would say one thing twice and neither of them clearly.
 */
export function pullStatus(pull: ForgePull): ForgeStatus {
  if (pull.state === 'merged') return { tone: 'ok', label: 'Merged', icon: LuGitMerge };
  if (pull.state === 'closed')
    return { tone: 'idle', label: 'Closed', icon: LuGitPullRequestClosed };
  if (pull.isDraft) return { tone: 'idle', label: 'Draft', icon: LuGitPullRequestDraft };
  switch (pull.reviewDecision) {
    case 'APPROVED':
      return { tone: 'ok', label: 'Approved', icon: LuCheck };
    case 'CHANGES_REQUESTED':
      return { tone: 'fail', label: 'Changes requested', icon: LuMessageSquareWarning };
    case 'REVIEW_REQUIRED':
      return { tone: 'warn', label: 'Review required', icon: LuEye, withLabel: true };
    default:
      return { tone: 'idle', label: 'Open', icon: LuGitPullRequest };
  }
}

/**
 * The checks rollup, when a PR has one. `null` renders nothing.
 *
 * Ringed glyphs, where `pullStatus` uses bare ones — the two pills are adjacent
 * on every PR row, so the ring is what says "this half is the machine's
 * verdict, the other is a human's".
 */
export function checksStatus(pull: ForgePull): ForgeStatus | null {
  switch (pull.checks) {
    case 'passing':
      return { tone: 'ok', label: 'Checks passing', icon: LuCircleCheck };
    case 'failing':
      return { tone: 'fail', label: 'Checks failing', icon: LuCircleX };
    case 'pending':
      return { tone: 'busy', label: 'Checks running', icon: LuLoaderCircle, spin: true };
    default:
      return null;
  }
}

/** A resolved review thread, in the shared vocabulary rather than its own chip. */
export const RESOLVED_STATUS: ForgeStatus = { tone: 'ok', label: 'Resolved', icon: LuCircleCheck };

/**
 * A status as a bare coloured glyph — or as a chip with its word, for the few
 * that are asking for something.
 *
 * The glyph-only form carries `role="img"` and an `aria-label`, matching the
 * terminal's spinner: the name is on the element itself rather than left to the
 * tooltip, so it is announced without needing focus. Which matters here more
 * than for an icon *button* — these marks are not focusable and never should
 * be, or a forty-row run list would put forty stops in the tab order.
 */
export function StatusPill({
  status,
  className = '',
}: {
  status: ForgeStatus;
  className?: string;
}) {
  const { icon: Icon, label, tone, withLabel, spin } = status;

  if (withLabel) {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full py-px pl-1 pr-1.5 text-[10px] font-medium leading-none ${TONE_CLASS[tone]} ${className}`}
      >
        <Icon className={`size-3 ${spin ? 'animate-spin' : ''}`} strokeWidth={2.5} />
        {label}
      </span>
    );
  }

  return (
    <Tooltip label={label}>
      <span
        role="img"
        aria-label={label}
        className={`inline-flex shrink-0 items-center ${GLYPH_CLASS[tone]} ${className}`}
      >
        <Icon className={`size-3.5 ${spin ? 'animate-spin' : ''}`} strokeWidth={2.5} />
      </span>
    </Tooltip>
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
    ? { tone: 'idle', label: 'Closed', icon: LuCircleCheck }
    : { tone: 'warn', label: 'Open', icon: LuCircleDot };
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

/**
 * A review verdict in the shared status vocabulary.
 *
 * Lives here rather than beside the conversation that renders it, now that a
 * status carries a glyph: a verdict defined in `pr-conversation` would have to
 * pick its own marks, and "approved" is exactly the word that must not be a
 * different green tick in the thread than it is on the row above it.
 *
 * `DISMISSED` is `idle`, not a failure: a dismissed review is one that no
 * longer counts, and painting it red would keep asking for attention on
 * something already resolved.
 */
export function reviewStatus(state: ForgeReviewState): ForgeStatus {
  switch (state) {
    case 'APPROVED':
      return { tone: 'ok', label: 'Approved', icon: LuCheck };
    case 'CHANGES_REQUESTED':
      return { tone: 'fail', label: 'Changes requested', icon: LuMessageSquareWarning };
    case 'DISMISSED':
      return { tone: 'idle', label: 'Dismissed', icon: LuCircleSlash };
    default:
      return { tone: 'idle', label: 'Reviewed', icon: LuMessageSquare };
  }
}
