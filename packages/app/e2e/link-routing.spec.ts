import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 71 Theme B: the migration itself, proved end to end.
 *
 * The unit tests (`open-in-midnite.test.ts`) cover `resolveLinkTarget` and
 * `openInMidnite` against a bare Zustand store. What only the assembled app
 * can show is that a real call site — the Reviews "Open on GitHub" button —
 * is actually wired to them: that with the stored preference on **Midnite
 * browser** the click reaches `openTab` and never `shell.openExternal`, and
 * that flipping the preference reverses which one fires. A button still
 * calling `openExternal` directly would look identical in the unit suite.
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

const pull = {
  number: 42,
  title: 'Reviews page',
  state: 'open',
  isDraft: false,
  reviewDecision: 'APPROVED',
  checks: 'passing',
  headBranch: 'feature/reviews',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/42',
};

const pullDetail = {
  body: 'Why this exists.',
  headSha: 'a'.repeat(40),
  baseBranch: 'main',
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  mergeable: 'MERGEABLE',
};

const data: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    pullDetail: { '42': pullDetail },
  },
};

const externalUrls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls);

const browserTabs = (page: Page) =>
  page.getByRole('tablist', { name: 'Browser tabs' }).getByRole('tab');

/** Same scroll-then-click shape as `reviews.spec.ts`'s `openPullRow` — see its own note. */
async function openPullRow(page: Page): Promise<void> {
  const row = page.getByText('Reviews page', { exact: true });
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await row.click();
}

/** Open the app, land on PR #42's detail, and return its "Open on GitHub" button. */
async function openPullDetail(page: Page) {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await openPullRow(page);
  await expect(page.getByRole('region', { name: 'Pull request #42' })).toBeVisible();

  return page.getByRole('button', { name: 'Open #42 on GitHub' });
}

/** Seed `ui-store`'s persisted preference before the app boots — see `kanban.spec.ts` for the pattern. */
async function seedLinkTarget(page: Page, linkTarget: 'in-app' | 'system'): Promise<void> {
  await page.addInitScript(
    (target) => {
      window.localStorage.setItem(
        'midnite-studio.ui',
        JSON.stringify({ state: { linkTarget: target }, version: 10 }),
      );
    },
    linkTarget,
  );
}

test('with Midnite browser selected, opening a pull request opens a tab and never reaches openExternal', async ({
  page,
}) => {
  // 'in-app' is the default, so no seeding needed — this is the state a fresh
  // install starts in.
  const openOnGitHub = await openPullDetail(page);
  await openOnGitHub.click();

  await expect(browserTabs(page)).toHaveCount(1);
  await expect(browserTabs(page)).toHaveAccessibleName(/github\.com/);
  expect(await externalUrls(page)).toEqual([]);
});

test('with System browser selected, the same click reaches openExternal instead', async ({
  page,
}) => {
  await seedLinkTarget(page, 'system');
  const openOnGitHub = await openPullDetail(page);
  await openOnGitHub.click();

  expect(await externalUrls(page)).toEqual(['https://github.com/bilo-io/midnite-studio/pull/42']);
  // No browser pane raised, and nothing in its tab strip — 'system' means the
  // link left the app rather than landing in a tab nobody asked to see.
  await expect(browserTabs(page)).toHaveCount(0);
});

test('shift-click always reaches openExternal, regardless of the stored preference', async ({
  page,
}) => {
  // The default preference is 'in-app' — proving Shift overrides it, rather
  // than merely agreeing with it, is the point of this case.
  const openOnGitHub = await openPullDetail(page);
  await openOnGitHub.click({ modifiers: ['Shift'] });

  expect(await externalUrls(page)).toEqual(['https://github.com/bilo-io/midnite-studio/pull/42']);
  await expect(browserTabs(page)).toHaveCount(0);
});
