import type { ForgeComment, ForgeReviewState } from '@midnite/studio-shared';
import { LuCheck, LuClock, LuMessageSquare, LuX } from 'react-icons/lu';
import type { IconType } from 'react-icons';

export type ReviewerState = 'waiting' | 'approved' | 'changes_requested' | 'commented';

export interface ReviewerConfig {
  stateLabel: string;
  borderColor: string;
  BadgeIcon: IconType;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  pillClass: string;
}

export const REVIEWER_CONFIG: Record<ReviewerState, ReviewerConfig> = {
  approved: {
    stateLabel: 'Approved',
    borderColor: 'border-emerald-500',
    BadgeIcon: LuCheck,
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-600 dark:text-emerald-400',
    badgeBorder: 'border-emerald-500/40',
    pillClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
  },
  commented: {
    stateLabel: 'Commented',
    borderColor: 'border-sky-500',
    BadgeIcon: LuMessageSquare,
    badgeBg: 'bg-sky-500/20',
    badgeText: 'text-sky-600 dark:text-sky-400',
    badgeBorder: 'border-sky-500/40',
    pillClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30',
  },
  changes_requested: {
    stateLabel: 'Changes requested',
    borderColor: 'border-red-500',
    BadgeIcon: LuX,
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-600 dark:text-red-400',
    badgeBorder: 'border-red-500/40',
    pillClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
  },
  waiting: {
    stateLabel: 'Awaiting review',
    borderColor: 'border-amber-500',
    BadgeIcon: LuClock,
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-600 dark:text-amber-400',
    badgeBorder: 'border-amber-500/40',
    pillClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  },
};

export interface AssignedReviewer {
  login: string;
  state: ReviewerState;
  stateLabel: string;
}

export interface ReviewerCandidate {
  login: string;
  state: ReviewerState | 'none';
  stateLabel: string;
  isRequested: boolean;
}

/**
 * Resolves all assigned reviewers associated with a pull request:
 * - Awaiting review: `detail.reviewRequests`
 * - Submitted review: comments where `kind === 'review'` (Approved, Changes requested, Commented)
 */
export function resolveAssignedReviewers(
  reviewRequests: string[] | undefined,
  comments: ForgeComment[] | undefined,
  pullAuthor?: string,
): AssignedReviewer[] {
  const requests = reviewRequests ?? [];
  const comms = comments ?? [];

  const reviewByAuthor = new Map<string, ForgeReviewState>();
  for (const comment of comms) {
    if (
      comment.kind === 'review' &&
      comment.author &&
      comment.author !== pullAuthor &&
      comment.reviewState
    ) {
      reviewByAuthor.set(comment.author, comment.reviewState);
    }
  }

  const assignedLogins = new Set<string>();
  for (const login of requests) {
    if (login && login !== pullAuthor) {
      assignedLogins.add(login);
    }
  }
  for (const login of reviewByAuthor.keys()) {
    assignedLogins.add(login);
  }

  const result: AssignedReviewer[] = [];
  for (const login of assignedLogins) {
    if (requests.includes(login)) {
      result.push({
        login,
        state: 'waiting',
        stateLabel: 'Awaiting review',
      });
    } else {
      const reviewState = reviewByAuthor.get(login);
      if (reviewState === 'APPROVED') {
        result.push({ login, state: 'approved', stateLabel: 'Approved' });
      } else if (reviewState === 'CHANGES_REQUESTED') {
        result.push({ login, state: 'changes_requested', stateLabel: 'Changes requested' });
      } else {
        result.push({ login, state: 'commented', stateLabel: 'Commented' });
      }
    }
  }

  return result;
}

/**
 * Resolves candidate suggested reviewers for the "Request review" popover:
 * - `reviewRequests`
 * - Logins who submitted reviews or commented
 */
export function resolveReviewerCandidates(
  reviewRequests: string[] | undefined,
  comments: ForgeComment[] | undefined,
  pullAuthor?: string,
): ReviewerCandidate[] {
  const requests = reviewRequests ?? [];
  const comms = comments ?? [];

  const reviewByAuthor = new Map<string, ForgeReviewState>();
  for (const comment of comms) {
    if (
      comment.kind === 'review' &&
      comment.author &&
      comment.author !== pullAuthor &&
      comment.reviewState
    ) {
      reviewByAuthor.set(comment.author, comment.reviewState);
    }
  }

  const candidateLogins = new Set<string>();
  for (const login of requests) {
    if (login && login !== pullAuthor) {
      candidateLogins.add(login);
    }
  }
  for (const login of reviewByAuthor.keys()) {
    candidateLogins.add(login);
  }
  for (const comment of comms) {
    if (comment.author && comment.author !== pullAuthor) {
      candidateLogins.add(comment.author);
    }
  }

  const result: ReviewerCandidate[] = [];
  for (const login of candidateLogins) {
    const isRequested = requests.includes(login);
    if (isRequested) {
      result.push({
        login,
        state: 'waiting',
        stateLabel: 'Awaiting review',
        isRequested: true,
      });
    } else if (reviewByAuthor.has(login)) {
      const reviewState = reviewByAuthor.get(login);
      if (reviewState === 'APPROVED') {
        result.push({ login, state: 'approved', stateLabel: 'Approved', isRequested: false });
      } else if (reviewState === 'CHANGES_REQUESTED') {
        result.push({
          login,
          state: 'changes_requested',
          stateLabel: 'Changes requested',
          isRequested: false,
        });
      } else {
        result.push({ login, state: 'commented', stateLabel: 'Commented', isRequested: false });
      }
    } else {
      result.push({ login, state: 'commented', stateLabel: 'Commented', isRequested: false });
    }
  }

  return result;
}
