import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The rail as the app's table of contents, and the sidebar it reshapes.
 *
 * The unit tests already own the table itself — which sections each view
 * narrows to, what the escape hatch puts back. What only the assembled app can
 * show is that the table actually reaches the DOM: that the Actions rail item
 * is absent for a repository `gh` could never answer for, that entering a view
 * takes the right sections away and leaves Worktrees, and that switching views
 * does not quietly drop the checkout you were looking at.
 *
 * Phase 82 Theme C, wave 4: 5 of this file's 9 tests moved to
 * `repos-panel.bridge.test.tsx` (`useUiStore.getState().setActiveView(...)`
 * standing in for a rail click, the same substitution the rest of that file
 * already uses). **4 stay**, all genuinely rail-shaped: "the rail carries all
 * sixteen views", "each view is reachable", "Actions/Reviews are absent for a
 * repository gh could never answer for" and "standing in Actions when it
 * disappears lands you on the graph" all need the actual nav rail —
 * `AppFrame` from `@bilo-io/shell`, fed the `nav` array `app.tsx` builds —
 * which is a different, much larger surface than `ReposPanel`. "The Changes
 * filter still behaves as Phase 17 shipped it" was dropped outright rather
 * than ported: `repos-panel.bridge.test.tsx` already asserts the identical
 * claim twice over ("the Changes view hides checkouts with nothing in them",
 * "the filter is visible while on, and reversible"). "Show all sections is
 * the escape hatch, and it persists" is trimmed to just its reload half below
 * — the escape-hatch behaviour itself moved, but a jsdom "reload" cannot
 * honestly exercise `useUiStore`'s persisted rehydration (a module singleton,
 * hydrated once at import time), the same reason
 * `settings-view.bridge.test.tsx` left an identical claim in Playwright.
 */

const MAIN = '/tmp/midnite-studio';
const FEATURE = '/tmp/midnite-studio-feature';

const entry = (path: string) => ({
  path,
  origPath: null,
  staged: 'unmodified',
  unstaged: 'modified',
  conflicted: false,
  similarity: null,
});

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const GITHUB_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
  pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
  forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
};

/**
 * A remote `gh` cannot speak for.
 *
 * GitLab rather than "no remote at all" on purpose: the rule under test is
 * about the FORGE, and a repo with no remotes would also pass a rule that
 * merely checked whether any remote existed.
 */
const GITLAB_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@gitlab.com:bilo-io/midnite-studio.git',
  pushUrl: 'git@gitlab.com:bilo-io/midnite-studio.git',
  forge: { host: 'gitlab.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'gitlab' },
};

/** A GitHub repo with two checkouts, one of them dirty. */
const base: MockFixtures = {
  ...fixtures,
  refs: [
    localRef('main', { isHead: true, worktreePath: MAIN }),
    localRef('feature/x', { worktreePath: FEATURE }),
    localRef('shelved'),
    // A tag, because `TreeSection` hides a section with nothing in it — without
    // one, "Show all sections" could not be told from a Tags section that is
    // simply empty.
    { ...localRef('v0.1.0'), fullName: 'refs/tags/v0.1.0', kind: 'tag' },
  ],
  remotes: [GITHUB_REMOTE],
  worktrees: [{ path: FEATURE, branch: 'feature/x' }],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [], [FEATURE]: [entry('src/a.ts')] },
  forge: { cli: { reason: 'ready' }, runs: [], pulls: [] },
};

async function open(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
}

const rail = (page: Page, name: string) => page.getByRole('link', { name, exact: true });

/** See `clickRailLink` in `mock-bridge.ts` for why a plain `.click()` races the rail's own hover-expand. */
const clickRail = clickRailLink;

/**
 * Scoped to the repositories sidebar, because the view panes reuse these words.
 *
 * The Actions view's own heading is the literal string "Actions", so an
 * unscoped `heading` locator matches both it and the sidebar section — and the
 * assertion that matters here is always about the sidebar.
 */
const panel = (page: Page) => page.getByRole('complementary', { name: 'Repositories' });
const heading = (page: Page, name: string) =>
  panel(page).getByRole('heading', { name, exact: true });

test('the rail carries all sixteen views, Dashboard ungrouped above the rest', async ({ page }) => {
  await open(page);

  for (const label of [
    'Dashboard',
    'Explorer',
    'Search',
    'Tests',
    'Database',
    'API Client',
    'Projects',
    'Graph',
    'Changes',
    'Actions',
    'Reviews',
    'Issues',
    'History',
    'Councils',
    'Workflows',
    'Sessions',
  ]) {
    await expect(rail(page, label)).toBeVisible();
  }

  // Settings and Lock screen are footer BUTTONs, not workspace links — they sit at
  // the bottom of the rail.
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lock screen' })).toBeVisible();
  await expect(rail(page, 'Settings')).toHaveCount(0);

  /*
    Dashboard is rendered through `NavConfig.pinned`, which the shell puts
    ABOVE the sections with no header of its own — so in document order it
    precedes every workspace item. Asserting the order is the only way to tell
    the pinned slot from a fourth entry in the section, which is what this
    deliberately is not.
  */
  const hrefs = await page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  // Read as hrefs, not text: the rail is collapsed to icons by default, so the
  // labels are not rendered and every `innerText` would come back empty.
  expect(hrefs[0]).toBe('/dashboard');
  expect(hrefs).toEqual([
    '/dashboard',
    '/files',
    '/search',
    '/tests',
    '/database',
    '/apiClient',
    '/issues',
    '/projects',
    '/graph',
    '/changes',
    '/actions',
    '/reviews',
    '/history',
    '/councils',
    '/workflows',
    '/video',
    '/sessions',
  ]);
});

test('each view is reachable and none of them answers as the graph', async ({ page }) => {
  await open(page);

  for (const label of ['Dashboard', 'Explorer', 'Changes', 'Actions', 'Tests', 'Reviews', 'Graph']) {
    await clickRail(page, label);
    await expect(rail(page, label)).toHaveAttribute('aria-current', 'page');
  }
});

test('Actions and Reviews are absent for a repository gh could never answer for', async ({
  page,
}) => {
  // A rail item that can only ever say "not applicable" is worse than no rail
  // item — the same rule that already keeps the forge sections out of the
  // tree, and the same `pickForgeRemote` gate Actions and Reviews both ask.
  await open(page, { ...base, remotes: [GITLAB_REMOTE], forge: undefined });

  await expect(rail(page, 'Actions')).toHaveCount(0);
  await expect(rail(page, 'Reviews')).toHaveCount(0);

  // Everything else is untouched: the rule is about GitHub, not about remotes.
  await expect(rail(page, 'Tests')).toBeVisible();
  await expect(rail(page, 'Dashboard')).toBeVisible();
});

test('the shape the user arranged the sidebar into survives a reload', async ({ page }) => {
  // The escape-hatch behaviour itself (revealing every section, and staying
  // per-view rather than also unfiltering Changes) moved to
  // `repos-panel.bridge.test.tsx`. What only a real reload can prove is that
  // the override persists — `useUiStore`'s own `persist` middleware
  // rehydrating from `localStorage` on a fresh page load.
  await open(page);
  await clickRail(page, 'Actions');
  await expect(heading(page, 'Local')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show all sections' }).click();
  await expect(heading(page, 'Local')).toBeVisible();

  await page.reload();
  await expect(heading(page, 'Worktrees')).toBeVisible();
  await expect(heading(page, 'Local')).toBeVisible();
});

test('standing in Actions when it disappears lands you on the graph', async ({ page }) => {
  await open(page);
  await clickRail(page, 'Actions');
  await expect(rail(page, 'Actions')).toHaveAttribute('aria-current', 'page');

  // A repo whose remotes gh cannot speak for takes the item away; leaving the
  // pane mounted with no rail entry current reads as the rail having lost its
  // selection rather than as the view having gone.
  await open(page, { ...base, remotes: [GITLAB_REMOTE], forge: undefined });

  await expect(rail(page, 'Actions')).toHaveCount(0);
  await expect(rail(page, 'Graph')).toHaveAttribute('aria-current', 'page');
});
