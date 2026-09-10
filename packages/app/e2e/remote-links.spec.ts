import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The forge link on a remote group, driven through the real sidebar.
 *
 * Phase 82 Theme C wave 5 moved this file's 3 tests to
 * `src/features/repos/repos-panel.bridge.test.tsx`, mounting `ReposPanel`
 * directly — that a remote listed by `mstudio:remotes:list` is matched to
 * the ref group of the same name and its project link opens an in-app
 * browser tab, that a remote with no forge offers no link at all, and that
 * the tree still renders with no remotes configured. The one test kept here
 * is a smoke test that the sidebar itself is reachable and shows a remote
 * group through the real bridge — everything about the link's own wiring now
 * lives in the jsdom test above.
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
];

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const withRemotes: MockFixtures = { ...fixtures, refs: REFS, remotes: REMOTES };

async function openSidebar(page: Page, data: MockFixtures = withRemotes): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Remotes' })).toBeVisible();
}

test('a github remote offers a link to its project page', async ({ page }) => {
  await openSidebar(page);

  await expect(
    page.getByRole('button', { name: 'Open bilo-io/midnite-studio on github.com' }),
  ).toBeVisible();
});
