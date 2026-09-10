import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 71 Theme B: the migration itself, proved end to end.
 *
 * The unit tests (`open-in-midnite.test.ts`) cover `resolveLinkTarget` and
 * `openInMidnite` against a bare Zustand store.
 *
 * Phase 82 Theme C wave 5 moved the single-PR link-routing cases (Midnite
 * browser, system browser, shift-click) to
 * `src/features/reviews/pr-detail-link-routing.bridge.test.tsx`, mounting
 * `PrDetail` directly. **The 1 test left here needs the real sidebar's repo
 * tree, the full-screen `BrowserPane` overlay and its tab-group buttons** — a
 * genuine cross-component/whole-shell flow, not a property of `PrDetail`
 * itself.
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

const browserTabs = (page: Page) =>
  page.getByRole('tablist', { name: 'Browser tabs' }).getByRole('tab');

/*
  Phase 71 Theme E's leftover verification item: "a PR opened from the Reviews
  view of repo A and one from repo B land in two different derived groups in
  the tab strip". The mock bridge hardcoded a single `repo-1` — `repos.list`
  always answered one repo, so there was no second repo to switch to — which
  is what `extraRepos`/`forge.pullsByRepo` (mock-bridge.ts) now fix. Grouping
  itself was already proven at the store layer (`browser-store.test.ts`'s
  `effectiveGroupId`); this is the missing assembled-app proof that opening a
  PR from each repo's Reviews view actually stamps a different `originRepoId`.
*/
const secondPull = {
  number: 99,
  title: 'Second repo PR',
  state: 'open',
  isDraft: false,
  reviewDecision: 'APPROVED',
  checks: 'passing',
  headBranch: 'feature/second',
  author: 'bilo',
  url: 'https://github.com/bilo-io/other-repo/pull/99',
};

const twoRepoData: MockFixtures = {
  ...data,
  extraRepos: [{ id: 'repo-2', name: 'other-repo', path: '/tmp/other-repo' }],
  forge: {
    cli: { reason: 'ready' },
    pullsByRepo: {
      'repo-1': [pull],
      'repo-2': [secondPull],
    },
    pullDetail: {
      '42': { ...pullDetail, pull },
      '99': { ...pullDetail, pull: secondPull },
    },
  },
};

/**
 * Expand `repoName`'s own Reviews > All Pull Requests fold in the repo tree,
 * open the row titled `title`, and return its "Open on GitHub" button.
 *
 * Clicking the row itself is what selects the repo (`ForgeRow`'s `onOpen`
 * calls `selectRepo(repoId)` before `selectPull`/`setActiveView('reviews')` —
 * see `forge-sections.tsx`'s own comment on why: "this row can be clicked
 * while a different repo is selected"), so no separate repo-switch step is
 * needed here.
 */
async function openPullFromRepoTree(
  page: Page,
  repoName: string,
  title: string,
  number: number,
) {
  const repoTree = page.getByLabel(repoName, { exact: true });
  await repoTree.getByRole('button', { name: 'Reviews', exact: true }).click();
  await repoTree.getByRole('button', { name: 'All Pull Requests', exact: true }).click();

  const row = page.getByText(title, { exact: true });
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await row.click();
  await expect(page.getByRole('region', { name: `Pull request #${number}` })).toBeVisible();
  return page.getByRole('button', { name: `Open #${number} on GitHub` });
}

test("a PR opened from repo A's Reviews view and one from repo B land in two different tab groups", async ({
  page,
}) => {
  await installMockBridge(page, twoRepoData);
  await page.goto('/');
  await expect(page.getByLabel('midnite-studio', { exact: true })).toBeVisible();

  const openFirst = await openPullFromRepoTree(page, 'midnite-studio', 'Reviews page', 42);
  await openFirst.click();
  // The default full-screen browser layout overlays the whole content row,
  // sidebar included (`browser-pane.tsx`'s `left: calc(-1 * var(--nav-offset))`)
  // — close it so the second repo's tree is clickable again.
  await page.getByRole('button', { name: 'Close browser' }).click();

  const openSecond = await openPullFromRepoTree(page, 'other-repo', 'Second repo PR', 99);
  await openSecond.click();

  await expect(browserTabs(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'midnite-studio tab group' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'other-repo tab group' })).toBeVisible();
});
