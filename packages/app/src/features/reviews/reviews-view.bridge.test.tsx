import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ReviewsList } from './reviews-list';

/**
 * Migrated from `e2e/reviews-view.spec.ts` (Phase 82 Theme C, wave 5) — the
 * three lazily-loaded scope groups (each opening independently and each
 * fetching its own listing), the default Open-tab filter, the status tabs,
 * the author-filter + search combination, and the "gh signed out" hint. 6 of
 * the original 9 tests moved here; 3 stay in Playwright, below.
 *
 * Driven through `ReviewsList` directly (`repoId` prop) rather than
 * `ReviewsView` (which only adds a `useActiveWorktree()` repo-resolution
 * wrapper around it) — the same reasoning `pr-detail.bridge.test.tsx` gives
 * for mounting `PrDetail` directly rather than through `ReviewsView`/
 * `ReviewsList`'s own selection plumbing: every one of these tests is about
 * the group/tab/filter behaviour once a repository is already known, not
 * about resolving which repository that is.
 *
 * **3 of the original 9 stay in Playwright**, following the exact precedent
 * `optimizer.spec.ts`/`actions-view.spec.ts` set: a test needing the app's
 * outer rail/routing/sidebar shell is a legitimate straggler even though
 * nothing about it needs real CSS or paint, because `renderView` mounts only
 * the component it is given, never the full `<App>` shell.
 * - "the Reviews nav item is hidden for a repository with no GitHub remote"
 *   tests the RAIL, not `ReviewsList`/`ReviewsView`.
 * - "the sidebar Reviews row opens the Reviews view rather than a workbench
 *   tab" tests the sidebar's own row and cross-view routing.
 * - "the Reviews view narrows the sidebar to Reviews and Worktrees, with the
 *   escape hatch intact" tests the SIDEBAR's narrowing, a different
 *   component than `ReviewsList` itself.
 */

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const pull = (over: Record<string, unknown>) => ({
  title: 'Untitled',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/x',
  author: 'bilo',
  mergedAt: null,
  closedAt: null,
  ...over,
  url: `https://github.com/bilo-io/midnite-studio/pull/${String(over['number'])}`,
});

/** One PR of each status tab, from two different authors. */
const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  forge: {
    cli: { reason: 'ready' },
    pulls: [
      pull({
        number: 101,
        title: 'Add reviews list',
        headBranch: 'feature/reviews',
        author: 'bilo',
        reviewDecision: 'APPROVED',
        checks: 'passing',
      }),
      pull({
        number: 102,
        title: 'WIP: highlight diffs',
        isDraft: true,
        headBranch: 'wip/highlight',
        author: 'ana',
      }),
      pull({
        number: 103,
        title: 'Fix flaky test',
        state: 'merged',
        headBranch: 'fix/flaky',
        author: 'bilo',
        mergedAt: '2026-08-20T10:00:00Z',
        closedAt: '2026-08-20T10:00:00Z',
      }),
      pull({
        number: 104,
        title: 'Drop dead code',
        state: 'closed',
        headBranch: 'chore/cleanup',
        author: 'ana',
        closedAt: '2026-08-21T10:00:00Z',
      }),
    ],
  },
};

/** The list pane, and only the list pane — the same scoping the e2e original used. */
const groups = () => screen.getByTestId('reviews-groups');

/** The rows of one scope group, once it is open. */
const pulls = (group = 'All Pull Requests') => within(groups()).getByRole('list', { name: group });

/** Open one scope group — which is also what makes it fetch. */
function expandGroup(title = 'All Pull Requests'): void {
  fireEvent.click(within(groups()).getByRole('button', { name: title }));
}

function openReviews(data: MockFixtures = base): void {
  renderView(<ReviewsList repoId="repo-1" />, { fixtures: data });
}

afterEach(cleanup);

describe('ReviewsList, assembled through the real bridge', () => {
  it('every group starts collapsed, and expanding one is what loads it', async () => {
    openReviews();

    // All three headings are there; none of them has a listing under it yet.
    for (const title of ['My Requests', 'Awaiting My Review', 'All Pull Requests']) {
      expect(within(groups()).getByRole('button', { name: title })).toBeTruthy();
    }
    expect(within(groups()).queryAllByRole('list')).toHaveLength(0);
    expect(screen.getByText('Open one of the groups on the left to see its pull requests.')).toBeTruthy();

    expandGroup();
    expect(await within(groups()).findByRole('list', { name: 'All Pull Requests' })).toBeTruthy();
  });

  it('each group is its own listing, and shows only its own scope', async () => {
    openReviews({
      ...base,
      forge: {
        ...base.forge,
        // Deliberately disjoint from `pulls`: if the groups shared one query
        // — or one cache key — whichever expanded first would serve its rows
        // to the others, and only fixtures that disagree can show they do not.
        pullsByScope: {
          mine: [pull({ number: 201, title: 'Mine to land', author: 'bilo' })],
          'review-requested': [pull({ number: 202, title: 'Yours to read', author: 'ana' })],
        },
      },
    });

    expandGroup('My Requests');
    const mine = await within(groups()).findByRole('list', { name: 'My Requests' });
    expect(within(mine).getByText('Mine to land')).toBeTruthy();
    expect(within(mine).queryByText('Yours to read')).toBeNull();

    expandGroup('Awaiting My Review');
    const reviewRequested = await within(groups()).findByRole('list', {
      name: 'Awaiting My Review',
    });
    expect(within(reviewRequested).getByText('Yours to read')).toBeTruthy();
    expect(within(reviewRequested).queryByText('Mine to land')).toBeNull();

    // And the first group is still showing its own answer, not the second's.
    expect(within(mine).getByText('Mine to land')).toBeTruthy();
  });

  it('the default Open tab excludes drafts, merged and closed PRs', async () => {
    openReviews();
    expandGroup();
    await within(groups()).findByRole('list', { name: 'All Pull Requests' });

    expect(within(pulls()).getByText('Add reviews list')).toBeTruthy();
    expect(within(pulls()).queryByText('WIP: highlight diffs')).toBeNull();
    expect(within(pulls()).queryByText('Fix flaky test')).toBeNull();
    expect(within(pulls()).queryByText('Drop dead code')).toBeNull();
  });

  it('status tabs narrow the list to each state', async () => {
    openReviews();
    expandGroup();
    await within(groups()).findByRole('list', { name: 'All Pull Requests' });

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    for (const title of [
      'Add reviews list',
      'WIP: highlight diffs',
      'Fix flaky test',
      'Drop dead code',
    ]) {
      expect(within(pulls()).getByText(title)).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('tab', { name: 'Draft' }));
    expect(within(pulls()).getByText('WIP: highlight diffs')).toBeTruthy();
    expect(within(pulls()).queryByText('Add reviews list')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Merged' }));
    expect(within(pulls()).getByText('Fix flaky test')).toBeTruthy();
    expect(within(pulls()).queryByText('WIP: highlight diffs')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Closed' }));
    expect(within(pulls()).getByText('Drop dead code')).toBeTruthy();
    expect(within(pulls()).queryByText('Fix flaky test')).toBeNull();
  });

  it('the author filter and the search box narrow the list together', async () => {
    openReviews();
    expandGroup();
    await within(groups()).findByRole('list', { name: 'All Pull Requests' });
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));

    fireEvent.click(screen.getByRole('button', { name: 'All authors' }));
    // A regex, not the exact string: the option's accessible name is the
    // label PLUS its adjoining count pill ("ana2"), so a whole-string match
    // for "ana" alone — correct under Playwright's own substring default —
    // never matches under Testing Library's whole-string one.
    fireEvent.click(await screen.findByRole('option', { name: /^ana/ }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(within(pulls()).getByText('WIP: highlight diffs')).toBeTruthy();
    expect(within(pulls()).getByText('Drop dead code')).toBeTruthy();
    expect(within(pulls()).queryByText('Add reviews list')).toBeNull();
    expect(within(pulls()).queryByText('Fix flaky test')).toBeNull();

    // Search narrows further, on top of the author filter already applied.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search pull requests' }), {
      target: { value: 'highlight' },
    });
    expect(within(pulls()).getByText('WIP: highlight diffs')).toBeTruthy();
    expect(within(pulls()).queryByText('Drop dead code')).toBeNull();
  });

  it('a repository with gh signed out shows the hint, not an empty list', async () => {
    openReviews({
      ...base,
      forge: { ...base.forge, cli: { reason: 'not-authenticated', hint: 'Run `gh auth login`…' } },
    });
    expandGroup();

    await waitFor(() => expect(screen.getByText('Run `gh auth login`…')).toBeTruthy());
    expect(within(groups()).queryAllByRole('list')).toHaveLength(0);
  });
});
