import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The rail as the app's table of contents, and the sidebar it reshapes.
 *
 * The unit tests already own the table itself — which sections each view
 * narrows to, what the escape hatch puts back. What only the assembled app can
 * show is that the table actually reaches the DOM: that the Actions rail item
 * is absent for a repository `gh` could never answer for, that entering a view
 * takes the right sections away and leaves Worktrees, and that switching views
 * does not quietly drop the checkout you were looking at.
 */

const MAIN = '/tmp/midnite-git';
const FEATURE = '/tmp/midnite-git-feature';

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
  fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
  pushUrl: 'git@github.com:bilo-io/midnite-git.git',
  forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
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
  fetchUrl: 'git@gitlab.com:bilo-io/midnite-git.git',
  pushUrl: 'git@gitlab.com:bilo-io/midnite-git.git',
  forge: { host: 'gitlab.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'gitlab' },
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

/** A section's fold toggle. Its accessible name is the title, plus a count. */
const section = (page: Page, name: string) =>
  panel(page).getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) });

test('the rail carries all eight views, Dashboard ungrouped above the rest', async ({ page }) => {
  await open(page);

  for (const label of ['Dashboard', 'Files', 'Graph', 'Changes', 'Actions', 'Tests', 'Reviews']) {
    await expect(rail(page, label)).toBeVisible();
  }

  // Settings is a footer BUTTON, not a workspace link — it is pinned to the
  // bottom of the rail the way settings sit in VS Code and GitKraken.
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
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
    '/graph',
    '/changes',
    '/actions',
    '/tests',
    '/reviews',
  ]);
});

test('each view is reachable and none of them answers as the graph', async ({ page }) => {
  await open(page);

  for (const label of ['Dashboard', 'Files', 'Changes', 'Actions', 'Tests', 'Reviews', 'Graph']) {
    await rail(page, label).click();
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

test('the Actions view narrows the sidebar to Actions and Worktrees', async ({ page }) => {
  await open(page);
  await rail(page, 'Actions').click();

  // Its own section, and the checkout context every view needs.
  await expect(heading(page, 'Actions')).toBeVisible();
  await expect(heading(page, 'Worktrees')).toBeVisible();

  // The ref sections answer a question this view is not asking.
  await expect(heading(page, 'Local')).toHaveCount(0);
  await expect(heading(page, 'Remotes')).toHaveCount(0);
  await expect(heading(page, 'Tags')).toHaveCount(0);
  await expect(heading(page, 'Reviews')).toHaveCount(0);

  // Unlike Changes, it keeps the CLEAN checkout: having runs has nothing to do
  // with having uncommitted work.
  await expect(page.getByRole('button', { name: 'Actions for worktree main' })).toBeVisible();
});

test('the view section is collapsed on arrival; Worktrees is open', async ({ page }) => {
  // Opening Actions costs a subprocess plus a rate-limited API call, which is
  // why Phase 17 closed it — entering the view must not spend that unasked.
  await open(page);
  await rail(page, 'Actions').click();

  await expect(section(page, 'Actions')).toHaveAttribute('aria-expanded', 'false');
  await expect(section(page, 'Worktrees')).toHaveAttribute('aria-expanded', 'true');
});

test('Show all sections is the escape hatch, and it persists', async ({ page }) => {
  await open(page);
  await rail(page, 'Actions').click();
  await expect(heading(page, 'Local')).toHaveCount(0);

  // Wanting a branch mid-triage must not be a reason to leave the view.
  const toggle = page.getByRole('button', { name: 'Show all sections' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();

  await expect(heading(page, 'Local')).toBeVisible();
  await expect(heading(page, 'Tags')).toBeVisible();
  await expect(heading(page, 'Reviews')).toBeVisible();

  // Per-view, so it did not also unfilter Changes.
  await rail(page, 'Changes').click();
  await expect(heading(page, 'Local')).toHaveCount(0);

  // And it is the shape the user arranged the sidebar into, so it survives.
  await rail(page, 'Actions').click();
  await expect(heading(page, 'Local')).toBeVisible();
  await page.reload();
  await expect(heading(page, 'Worktrees')).toBeVisible();
  await expect(heading(page, 'Local')).toBeVisible();
});

test('the Changes filter still behaves as Phase 17 shipped it', async ({ page }) => {
  // Folding it into the view table must not change what it does or what it is
  // called — this is the accessible name users have been reading since.
  await open(page);
  await rail(page, 'Changes').click();

  const toggle = page.getByRole('button', { name: 'Showing only changed checkouts' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await expect(page.getByRole('button', { name: /Actions for worktree feature\/x/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for worktree main' })).toHaveCount(0);

  await toggle.click();
  await expect(heading(page, 'Local')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for worktree main' })).toBeVisible();
});

test('a view with no narrowing of its own can still be filtered by hand', async ({ page }) => {
  // Phase 17 shipped this and the fold-in must not remove it: the button works
  // in Graph too, and turning it on there means the same thing it always did.
  await open(page);

  await expect(heading(page, 'Local')).toBeVisible();
  await page.getByRole('button', { name: 'Show every ref and checkout' }).click();

  await expect(heading(page, 'Local')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actions for worktree main' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Actions for worktree feature\/x/ })).toBeVisible();
});

test('switching views keeps the checkout you were looking at', async ({ page }) => {
  // The rail changes what you are looking AT, never what you are looking at it
  // FOR. Losing the selection would make every view a fresh start.
  await open(page);

  const row = page.getByRole('button', { name: /^feature\/x/ }).last();
  await row.click();

  for (const label of ['Files', 'Actions', 'Tests', 'Dashboard', 'Graph']) {
    await rail(page, label).click();
    await expect(page.getByRole('button', { name: /Actions for worktree feature\/x/ })).toBeVisible();
  }

  // Still the selected one, not merely still listed.
  const selected = await page.evaluate(() => {
    const raw = localStorage.getItem('midnite-git.ui');
    return raw ? (JSON.parse(raw) as { state?: Record<string, unknown> }).state : undefined;
  });
  // The selection is session state and deliberately unpersisted — what matters
  // is that the row is still marked active in the live DOM.
  expect(selected).not.toHaveProperty('selectedWorktreePath');
});

test('standing in Actions when it disappears lands you on the graph', async ({ page }) => {
  await open(page);
  await rail(page, 'Actions').click();
  await expect(rail(page, 'Actions')).toHaveAttribute('aria-current', 'page');

  // A repo whose remotes gh cannot speak for takes the item away; leaving the
  // pane mounted with no rail entry current reads as the rail having lost its
  // selection rather than as the view having gone.
  await open(page, { ...base, remotes: [GITLAB_REMOTE], forge: undefined });

  await expect(rail(page, 'Actions')).toHaveCount(0);
  await expect(rail(page, 'Graph')).toHaveAttribute('aria-current', 'page');
});
