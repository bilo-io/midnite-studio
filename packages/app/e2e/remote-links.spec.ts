import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The forge link on a remote group, driven through the real sidebar.
 *
 * The unit tests cover the URL grammar and the protocol allow-list. What only
 * the app can show is that the two ever meet: that a remote listed by
 * `mstudio:remotes:list` is matched to the ref group of the same name, and that
 * clicking the control hands `shell.openExternal` the URL for *that* remote.
 * A button wired to the wrong remote looks identical from the outside.
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
    upstream: { name: 'origin/main', ahead: 0, behind: 0, gone: false },
    isHead: true,
    worktreePath: null,
  },
  remoteRef('origin', 'main'),
  remoteRef('backup', 'main'),
];

/**
 * Two remotes that must be treated differently: one resolves to a project page,
 * the other is a path on disk and has none.
 */
const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
  },
  {
    name: 'backup',
    fetchUrl: '/Volumes/backup/midnite-git.git',
    pushUrl: '/Volumes/backup/midnite-git.git',
    forge: null,
  },
];

const withRemotes: MockFixtures = { ...fixtures, refs: REFS, remotes: REMOTES };

async function openSidebar(page: Page, data: MockFixtures = withRemotes): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Remotes' })).toBeVisible();
}

const externalUrls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls);

test('a github remote offers a link to its project page', async ({ page }) => {
  await openSidebar(page);

  const link = page.getByRole('button', { name: 'Open bilo-io/midnite-git on github.com' });
  await expect(link).toBeVisible();
  await link.click();

  // https, not the ssh URL the remote was configured with: the web page and the
  // clone URL are different things, and only one of them opens in a browser.
  await expect.poll(() => externalUrls(page)).toEqual(['https://github.com/bilo-io/midnite-git']);
});

test('a remote with no forge offers no link at all', async ({ page }) => {
  await openSidebar(page);

  // Present as a group — a local-path remote is a real remote — but with
  // nothing to open. Absent rather than disabled: there is no web page for this
  // remote and there never will be, which is not a "temporarily unavailable".
  await expect(page.getByRole('heading', { name: 'backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open .* on / })).toHaveCount(1);
});

test('the sidebar renders normally for a repo with no remotes configured', async ({ page }) => {
  // The degrade-not-error case from the phase doc's verification list: a repo
  // with remote-tracking refs but no readable config must still draw its tree.
  await openSidebar(page, { ...fixtures, refs: REFS, remotes: [] });

  await expect(page.getByRole('heading', { name: 'origin' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open .* on / })).toHaveCount(0);
});
