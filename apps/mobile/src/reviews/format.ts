// Pure presentation helpers for Reviews (Phase 146 Theme I): scope mapping, the badge text and tone for a review decision,
// the checks glyph, and the rule for when a review may be submitted.
import type { ForgePull, ForgePullScope, ForgeReviewDecision } from '@midnite/studio-shared';
import type { BadgeTone } from '@bilo-io/ui-native';
import type { PullCheck, PullReviewer } from '../data/source';

export type ReviewTab = 'requested' | 'mine' | 'all';

export const SCOPE_OF: Record<ReviewTab, ForgePullScope> = { requested: 'review-requested', mine: 'mine', all: 'all' };

export function decisionBadge(decision: ForgeReviewDecision | null): { label: string; tone: BadgeTone } | null {
  switch (decision) {
    case 'APPROVED':
      return { label: 'Approved', tone: 'success' };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes requested', tone: 'warning' };
    case 'REVIEW_REQUIRED':
      return { label: 'Review required', tone: 'neutral' };
    default:
      return null;
  }
}

export function stateBadge(pull: Pick<ForgePull, 'state' | 'isDraft'>): { label: string; tone: BadgeTone } {
  if (pull.state === 'merged') return { label: 'Merged', tone: 'primary' };
  if (pull.state === 'closed') return { label: 'Closed', tone: 'neutral' };
  return pull.isDraft ? { label: 'Draft', tone: 'neutral' } : { label: 'Open', tone: 'info' };
}

export type ChecksGlyph = 'checkCircle' | 'xCircle' | 'clock';
export function checksGlyph(checks: ForgePull['checks']): { icon: ChecksGlyph; label: string } | null {
  if (checks === 'passing') return { icon: 'checkCircle', label: 'Checks passing' };
  if (checks === 'failing') return { icon: 'xCircle', label: 'Checks failing' };
  if (checks === 'pending') return { icon: 'clock', label: 'Checks pending' };
  return null;
}

export const checkGlyphOf = (c: PullCheck['conclusion']): ChecksGlyph =>
  c === 'failure' ? 'xCircle' : c === 'pending' ? 'clock' : 'checkCircle';

export const reviewerLabel = (s: PullReviewer['state']): string =>
  ({ APPROVED: 'Approved', CHANGES_REQUESTED: 'Changes requested', COMMENTED: 'Commented', DISMISSED: 'Dismissed', PENDING: 'Pending', REQUESTED: 'Requested' })[s];

/** ISO 8601 as unix seconds; 0 for a missing or unparseable date. */
export const isoToUnix = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
};

export type ReviewAction = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

/** Why the review bar is disabled, or null when the viewer may review. GitHub forbids approving or requesting changes on your own PR. */
export function reviewBlockedReason(pull: Pick<ForgePull, 'state' | 'author'>, viewerLogin: string | null): string | null {
  if (pull.state !== 'open') return `This pull request is ${pull.state}.`;
  if (viewerLogin && pull.author && viewerLogin.toLowerCase() === pull.author.toLowerCase()) return 'You cannot review your own pull request.';
  return null;
}

/** Request changes and Comment need a body; Approve does not. */
export const reviewBodyRequired = (action: ReviewAction): boolean => action !== 'APPROVE';
