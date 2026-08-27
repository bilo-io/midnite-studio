import type { ForgePullScope } from '@midnite/git-shared';

/**
 * The three questions a reviewer actually arrives with, in the order they
 * arrive with them.
 *
 * "What is waiting on me" and "what is waiting on someone else for me" are
 * different jobs with different urgency, and both were previously buried in one
 * repository-wide list that a busy repo pushes off the bottom of. Splitting
 * them into scoped listings is what lets each one be a `gh` query of its own
 * rather than a filter applied to a page that had already been capped — see
 * `ForgePullScope` for why that distinction is not cosmetic.
 *
 * One table, shared by the sidebar's Reviews section and the Reviews view, so
 * the two surfaces cannot drift into different names, a different order, or a
 * different idea of which scope "mine" means. Its `scope` doubles as the key:
 * a second identifier would only be a second thing to keep in step.
 */
export type ReviewGroup = {
  scope: ForgePullScope;
  title: string;
  /** Said when the listing succeeded and simply matched nothing. */
  empty: string;
};

export const REVIEW_GROUPS: readonly ReviewGroup[] = [
  {
    scope: 'mine',
    title: 'My Requests',
    empty: 'You have no pull requests here.',
  },
  {
    scope: 'review-requested',
    title: 'Awaiting My Review',
    /*
      "Nothing is requested from you" rather than "nothing to review": GitHub's
      `review-requested:@me` matches direct requests only, so a PR routed to a
      team you are in is genuinely not in this answer and the sentence must not
      claim otherwise.
    */
    empty: 'No reviews are requested from you.',
  },
  {
    scope: 'all',
    title: 'All Pull Requests',
    empty: 'No pull requests yet.',
  },
];
