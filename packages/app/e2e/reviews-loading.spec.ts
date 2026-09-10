import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  createShotTaker,
  fixtures,
  installMockBridge,
  type MockFixtures,
  mockSha,
  REPRODUCIBLE_REMOTE,
  setTheme,
} from './shots-helper';

/**
 * The Reviews view's loading states, held still and photographed.
 *
 * Phase 82 Theme C wave 5 moved 6 of this file's 7 tests to
 * `src/features/reviews/pr-detail.bridge.test.tsx`, using
 * `queryClient.setQueryData` to stand in for the status bar's
 * `checks-verdict` widget (always mounted in the real app, never mounted in
 * that jsdom harness) pre-warming the header's own listing query. **The one
 * test left here — "the Files tab in dark, mid-fetch" — is a genuine
 * straggler**: its only assertion beyond the migrated light-theme Files test
 * is visual (`setTheme` just flips `document.documentElement`'s `dark`
 * class; "the bars are `bg-muted`, so they follow the theme" is a computed-
 * style/paint claim jsdom cannot make), and the e2e original itself only
 * *photographs* that distinction (`shoot`, gated on `MSTUDIO_SHOTS`) — the
 * unconditional assertions here are simply a repeat of the light-theme case.
 *
 * See `pr-detail.bridge.test.tsx`'s own doc comment for the rest of the
 * original assertions, ported one-for-one.
 */

const OUT = '../../docs/screenshots/phase-20-reviews-loading';

/* Long enough to open a tab and settle before the answer lands, short enough
   that four tests do not add a minute to the suite. */
const LATENCY = 4000;

const HEAD_SHA = mockSha('c0ffee', '0');

const REMOTES = [REPRODUCIBLE_REMOTE];

const pull = {
  number: 128,
  title: 'Spinners and loading skeletons for the Reviews view',
  state: 'open',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  checks: 'passing',
  headBranch: 'feature/reviews-loading',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/128',
};

const data: MockFixtures = {
  ...fixtures,
  forgeLatencyMs: LATENCY,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { '/tmp/midnite-studio': [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    runs: [],
    pullDetail: {
      '128': {
        body: 'The Reviews view now draws the shape of what it is fetching.',
        headSha: HEAD_SHA,
        baseBranch: 'main',
        additions: 412,
        deletions: 38,
        changedFiles: 9,
        mergeable: 'MERGEABLE',
      },
    },
  },
};

/** The Reviews view, opened while the pull request listing is still out. */
async function openReviews(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  /*
    The nav rail's entry is a LINK; the sidebar has a `button` by the same name
    for its own Reviews section, and clicking that one only folds a tree. The
    link also appears a beat late here — it is gated on the forge being
    available, which is itself one of the calls being held — so Playwright's
    auto-wait is doing real work on this line.
  */
  await clickRailLink(page, 'Reviews');
  /*
    Every scope group starts collapsed, and a collapsed group issues no query —
    so the list pane has no loading state to photograph until one is opened.
    Opening it is what puts the held `gh pr list` in flight.
  */
  await page
    .getByTestId('reviews-groups')
    .getByRole('button', { name: 'All Pull Requests' })
    .click();
  /*
    Off the rail. The click leaves the pointer resting on the nav rail, which
    hover-expands into a flyout over the sidebar — and since `shoot` settles
    animations, that flyout is fully open in every screenshot rather than
    caught halfway. Parking the pointer over the empty list pane costs nothing
    and keeps the shots of the app as it actually sits.
  */
  await page.mouse.move(535, 500);
}

/**
 * A row in the Reviews view's own list.
 *
 * Scoped to that list on purpose: the sidebar carries a row per pull request
 * too, with the same title, and it sits under a sticky section header that
 * intercepts the click. Both rows select the PR, so an unscoped locator is not
 * wrong so much as unreliable — it picks whichever the DOM happens to order
 * first and then fails on the header rather than on anything real.
 */
function prRow(page: Page, title: string) {
  return page
    .getByTestId('reviews-groups')
    .getByRole('list', { name: 'All Pull Requests' })
    .getByRole('button', { name: new RegExp(title) });
}

/**
 * One loading state, photographed.
 *
 * `animations: 'disabled'` is the whole reason this is a helper rather than a
 * bare `page.screenshot`. Without it these shots catch the app mid-transition:
 * the shell's sidebar is halfway through its expand, the view is halfway
 * through its fade, and the skeleton bars are wherever `animate-pulse` happened
 * to be — which came out as a washed-out grey page that showed none of the work
 * it was supposed to document. Playwright fast-forwards finite animations to
 * their end state and cancels infinite ones to their first frame, so the chrome
 * settles and the bars sit at full opacity, the same way every time.
 */
const shoot = createShotTaker(OUT, { animations: 'disabled' });

test('the Files tab in dark, mid-fetch', async ({ page }) => {
  // The bars are `bg-muted`, so they follow the theme rather than being a grey
  // that only works on one ground. This is the shot that would catch it if that
  // stopped being true.
  await setTheme(page, 'dark');
  await openReviews(page);
  await prRow(page, pull.title).click();
  await expect(page.getByRole('region', { name: `Pull request #${pull.number}` })).toBeVisible();
  await setTheme(page, 'dark');

  const files = page.getByRole('tab', { name: 'Files', exact: true });
  await files.click();
  // The strip and the panel read the same state, and the shot is only worth
  // keeping if it shows them agreeing.
  await expect(files).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Loading the diff…')).toBeAttached();

  if (process.env.MSTUDIO_SHOTS) {
    await shoot(page, 'files-loading-dark');
  }
});
