import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 28 Theme D: a repo's folded sidebar sections survive what
 * `useSectionToggles`'s old per-mount `useState` never could — collapsing and
 * re-expanding the repo row (which unmounts and remounts `RepoTree` outright)
 * and a full reload, because the fold now lives in `ui-store`'s
 * `collapsedRepoSections` rather than component state.
 */
const remoteRef = (remote: string, branch: string) => ({
  name: `${remote}/${branch}`,
  fullName: `refs/remotes/${remote}/${branch}`,
  kind: 'remoteBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
});

const REFS = [
  {
    name: 'main',
    fullName: 'refs/heads/main',
    kind: 'localBranch',
    sha: 'a'.repeat(40),
    upstream: null,
    isHead: true,
    worktreePath: null,
  },
  remoteRef('origin', 'main'),
];

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
  },
];

const withRemotes: MockFixtures = { ...fixtures, refs: REFS, remotes: REMOTES };

const panel = (page: Page) => page.getByRole('complementary', { name: 'Repositories' });
const heading = (page: Page, name: string) =>
  panel(page).getByRole('heading', { name, exact: true });
/** A section's fold toggle. Its accessible name is the title, plus a count. */
const section = (page: Page, name: string) =>
  panel(page).getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) });

test('folding Remotes survives collapsing and re-expanding the repo, and a reload', async ({
  page,
}) => {
  await installMockBridge(page, withRemotes);
  await page.goto('/');
  await expect(heading(page, 'Remotes')).toBeVisible();

  await section(page, 'Remotes').click();
  await expect(section(page, 'Remotes')).toHaveAttribute('aria-expanded', 'false');

  // Collapsing the repo row unmounts `RepoTree` outright — the regression a
  // per-mount `useState` could not survive.
  await panel(page).getByRole('button', { name: 'Collapse midnite-git' }).click();
  await expect(heading(page, 'Remotes')).toHaveCount(0);

  await panel(page).getByRole('button', { name: 'Expand midnite-git' }).click();
  await expect(heading(page, 'Remotes')).toBeVisible();
  await expect(section(page, 'Remotes')).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await expect(heading(page, 'Remotes')).toBeVisible();
  await expect(section(page, 'Remotes')).toHaveAttribute('aria-expanded', 'false');
});

test("a remote group's own fold persists across a reload, independently of Remotes", async ({
  page,
}) => {
  await installMockBridge(page, withRemotes);
  await page.goto('/');
  await expect(heading(page, 'origin')).toBeVisible();

  await section(page, 'origin').click();
  await expect(section(page, 'origin')).toHaveAttribute('aria-expanded', 'false');
  // Folding one remote group must not touch the section it lives inside.
  await expect(section(page, 'Remotes')).toHaveAttribute('aria-expanded', 'true');

  await page.reload();
  await expect(heading(page, 'origin')).toBeVisible();
  await expect(section(page, 'origin')).toHaveAttribute('aria-expanded', 'false');
});
