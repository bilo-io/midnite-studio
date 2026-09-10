import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The review write path (Phase 20 Themes F and G).
 *
 * Phase 82 Theme C wave 3 moved 12 of this file's original 13 tests to
 * `src/features/reviews/pr-detail.bridge.test.tsx`, mounting `PrDetail`
 * directly through the same `MockFixtures`/`buildMockBridge` fake under
 * vitest — including the Settings-switch guard, via a small harness that
 * mounts `ReviewsPage` beside `PrDetail` (see that file's own comment).
 *
 * **This one test stays**, as the theme's one required e2e smoke test per
 * view: a full write round trip — open the Reviews view through the real
 * sidebar, open a real pull request, approve it with a typed body, and
 * confirm the composer closes — proves the assembled component actually
 * renders and wires up its bridge calls inside a real browser against the
 * real preload contract, which is exactly the kind of question a jsdom
 * mount cannot answer on its own.
 */

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const LOCAL_REF = {
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: true,
  worktreePath: MAIN,
};

const OPEN_PULL = {
  number: 201,
  title: 'Teach the app to review',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/writes',
  author: 'bilo',
  mergedAt: null,
  closedAt: null,
  url: 'https://github.com/bilo-io/midnite-studio/pull/201',
};

/** Fourteen commits, of which the wire carries five — see `PULL_COMMIT_SAMPLE`. */
const DETAIL = {
  body: 'The write half.',
  headSha: 'c'.repeat(40),
  baseBranch: 'main',
  additions: 40,
  deletions: 4,
  changedFiles: 3,
  mergeable: 'MERGEABLE',
  commitCount: 14,
  commits: [
    { sha: 'f'.repeat(40), subject: 'wire the action bar' },
    { sha: 'e'.repeat(40), subject: 'add gh-write' },
  ],
  reviewRequests: ['ana'],
};

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  refs: [LOCAL_REF],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [OPEN_PULL],
    pullDetail: { '201': DETAIL },
    pullComments: { '201': [] },
  },
};

type WriteCall = { channel: string; request: Record<string, unknown> };

/**
 * Every write the app has sent, in order.
 *
 * `mock-bridge.ts` records each one on `window.__mstudioWrites` — see its
 * `recordWrite`. Reading the request rather than the rendered result is the
 * whole point: an approval and a comment look the same on screen until you look
 * at which verb was sent, and the verb is the thing worth asserting.
 */
const recorded = (page: Page): Promise<WriteCall[]> =>
  page.evaluate(
    () => (window as unknown as { __mstudioWrites?: WriteCall[] }).__mstudioWrites ?? [],
  );

/**
 * Open the Reviews view and the one pull request in it, with writes enabled.
 *
 * Via the sidebar's Reviews *section* rather than the nav rail's link, matching
 * `reviews.spec.ts`: clicking the rail leaves it hover-expanded over the pane
 * the next click needs, and every action after that fights an overlay.
 */
async function openPull(page: Page, data: MockFixtures = base): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({ state: { forgeWritesEnabled: true }, version: 2 }),
    );
  });
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  // The section is a heading over three lazy scopes now — the rows live under
  // one of them, and nothing is fetched until that one is opened.
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  /*
    Centred first, then clicked — the same fix `reviews.spec.ts` documents on its
    own `openPullRow`. Playwright's auto-scroll brings a row to the *top* of the
    scroll container, which is where the sticky "All Pull Requests" header sits,
    so the click is intercepted, retried, re-scrolled to the identical place and
    intercepted again until the 30s timeout. It only bites under a loaded runner
    (the list has to be long enough to scroll at all).
  */
  const pullRow = page.getByText('Teach the app to review', { exact: true });
  await pullRow.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await pullRow.click();
  await expect(page.getByRole('region', { name: 'Pull request #201' })).toBeVisible();
}

test('approving submits APPROVE with the body that was typed', async ({ page }) => {
  await openPull(page);

  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('textbox', { name: /Approve/ }).fill('reads well');
  // The submit button restates the verb, so it is never ambiguous what will be
  // published — see the action bar's doc comment on the one-composer model.
  await page.getByRole('button', { name: 'Approve', exact: true }).nth(1).click();

  await expect
    .poll(async () => (await recorded(page)).map((call) => call.channel))
    .toContain('pullReview');
  const call = (await recorded(page)).find((entry) => entry.channel === 'pullReview');
  expect(call?.request).toMatchObject({ number: 201, event: 'APPROVE', body: 'reads well' });

  // The composer closes on success, and the body is not left behind to be
  // resubmitted by a second click.
  await expect(page.getByRole('textbox', { name: /Approve/ })).toHaveCount(0);
});
