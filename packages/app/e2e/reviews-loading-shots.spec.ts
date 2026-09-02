import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Reviews view's loading states, held still and photographed.
 *
 * These are the one part of the view that never renders in any other spec: the
 * mock bridge answers in the same tick it is asked, so the skeletons live for
 * zero frames and a change that deleted them would pass the whole suite.
 * `forgeLatencyMs` holds every forge answer long enough for the pane to be
 * seen, and each test screenshots one of them.
 *
 * These assert as well as photograph. The assertion is the `sr-only` status
 * text each skeleton carries, because that — not the bars — is the part a
 * reader who cannot see the pane depends on, and it is the part most easily
 * lost in a refactor that keeps the shapes.
 */

const OUT = '../../docs/screenshots/phase-20-reviews-loading';

/* Long enough to open a tab and settle before the answer lands, short enough
   that four tests do not add a minute to the suite. */
const LATENCY = 4000;

const HEAD_SHA = 'c0ffee'.padEnd(40, '0');

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

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

/**
 * A second pull request, and the reason there is one.
 *
 * `PrDetail` reads the cached LISTING for its header and fetches the detail
 * separately, so which skeleton a reader sees depends on which of those two is
 * missing. Opening the first PR of a session is missing both and gets the whole
 * pane; switching to a second has the listing already and is missing only the
 * detail, which is the state the Overview skeleton and the header's meta bars
 * exist for. One PR in the fixture can only ever show the first of those.
 */
const second = {
  ...pull,
  number: 131,
  title: 'Skeletons for the Checks tab',
  headBranch: 'feature/checks-loading',
  checks: 'pending',
};

const data: MockFixtures = {
  ...fixtures,
  forgeLatencyMs: LATENCY,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { '/tmp/midnite-studio': [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull, second],
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
      '131': {
        body: 'The Checks tab gets the job tree and log pane in outline.',
        headSha: HEAD_SHA,
        baseBranch: 'main',
        additions: 96,
        deletions: 12,
        changedFiles: 3,
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
  await page.getByRole('link', { name: 'Reviews' }).click();
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
async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });
}

test('the pull request list, mid-fetch', async ({ page }) => {
  await openReviews(page);

  await expect(page.getByText('Loading pull requests…')).toBeAttached();
  // The empty detail column shows the shape of a PR rather than a sentence
  // about there not being one — the listing has not come back to say either way.
  await expect(page.getByText('Loading the pull request…')).toBeAttached();

  await shoot(page, 'list-loading');
});

test('a pull request opening, with nothing cached', async ({ page }) => {
  await openReviews(page);

  /*
    The row's own title is already on screen the moment it is clicked — not
    from the list pane (a *different* `gh pr list`, scoped `state: 'all'`) but
    from the status bar's checks verdict (`checks-verdict.tsx`), which queries
    the header's own default listing (`state: 'open'`, unscoped) the instant a
    GitHub remote is found, well before any row is ever clicked. So the header
    and its badges render immediately from that cache; only the detail proper
    — the additions/deletions, the mergeable state, the description — is still
    out, which is the Overview skeleton's job, not the whole-pane one.
  */
  await prRow(page, pull.title).click();
  await expect(page.getByRole('region', { name: `Pull request #${pull.number}` })).toBeVisible();
  await expect(page.getByText('Loading the description…')).toBeAttached();

  await shoot(page, 'detail-loading');
});

test('switching pull requests, with the listing already cached', async ({ page }) => {
  await openReviews(page);
  await prRow(page, pull.title).click();
  await expect(page.getByRole('region', { name: `Pull request #${pull.number}` })).toBeVisible();

  // Now the listing is cached, so #131's header renders immediately from it and
  // only the detail is outstanding: the body is the Overview skeleton and the
  // header's second line holds the space its counts are about to take.
  await prRow(page, second.title).click();
  await expect(page.getByRole('region', { name: `Pull request #${second.number}` })).toBeVisible();
  await expect(page.getByText('Loading the description…')).toBeAttached();

  await shoot(page, 'overview-loading');
});

test('the Files tab, mid-fetch', async ({ page }) => {
  await openReviews(page);
  await prRow(page, pull.title).click();
  await expect(page.getByRole('region', { name: `Pull request #${pull.number}` })).toBeVisible();

  const files = page.getByRole('tab', { name: 'Files', exact: true });
  await files.click();
  // The strip and the panel read the same state, and the shot is only worth
  // keeping if it shows them agreeing.
  await expect(files).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Loading the diff…')).toBeAttached();

  await shoot(page, 'files-loading');
});

test('the Files tab in dark, mid-fetch', async ({ page }) => {
  // The bars are `bg-muted`, so they follow the theme rather than being a grey
  // that only works on one ground. This is the shot that would catch it if that
  // stopped being true.
  await page.emulateMedia({ colorScheme: 'dark' });
  await openReviews(page);
  await prRow(page, pull.title).click();
  await expect(page.getByRole('region', { name: `Pull request #${pull.number}` })).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.add('dark'));

  const files = page.getByRole('tab', { name: 'Files', exact: true });
  await files.click();
  // The strip and the panel read the same state, and the shot is only worth
  // keeping if it shows them agreeing.
  await expect(files).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Loading the diff…')).toBeAttached();

  await shoot(page, 'files-loading-dark');
});

test('the Conversation tab, mid-fetch', async ({ page }) => {
  await openReviews(page);
  await prRow(page, pull.title).click();
  await expect(page.getByRole('region', { name: `Pull request #${pull.number}` })).toBeVisible();

  const conversation = page.getByRole('tab', { name: 'Conversation', exact: true });
  await conversation.click();
  await expect(conversation).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Loading the conversation…')).toBeAttached();

  await shoot(page, 'conversation-loading');
});

test('the Checks tab, mid-fetch', async ({ page }) => {
  await openReviews(page);
  await prRow(page, pull.title).click();
  await expect(page.getByRole('region', { name: `Pull request #${pull.number}` })).toBeVisible();

  /*
    Not `exact`: the tab carries the checks pill, so its accessible name is
    "Checks Checks passing". Anchoring the front of it is enough to tell it from
    every other tab.
  */
  await page.getByRole('tab', { name: /^Checks/ }).click();
  await expect(page.getByText('Loading the checks…')).toBeAttached();

  await shoot(page, 'checks-loading');
});
