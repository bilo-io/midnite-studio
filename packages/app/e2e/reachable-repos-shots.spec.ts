import { expect, test } from '@playwright/test';

import type { ForgeAccount, ReachableRepo } from '@midnite/studio-shared';

import { installShotsBridge, setReducedMotion, setTheme, shotPath, stubGravatars } from './shots-helper';

/**
 * Settings ▸ Accounts ▸ Reachable repositories rows — provider mark, metadata
 * line and language bar — for the PR body. Run with `MSTUDIO_SHOTS=1`;
 * skipped otherwise, like every other `*-shots.spec.ts`.
 */
const OUT = '../../docs/screenshots/reachable-repo-meta';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });

const ACCOUNT: ForgeAccount = {
  id: 'github:github.com:bilo-io',
  kind: 'github',
  host: 'github.com',
  login: 'bilo-io',
  displayName: 'Bilo',
  avatarUrl: null,
  addedAt: 0,
  hasToken: false,
  delegated: 'gh',
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const REPOS: ReachableRepo[] = [
  {
    owner: 'bilo-io',
    name: 'midnite-studio',
    fullName: 'bilo-io/midnite-studio',
    url: 'https://github.com/bilo-io/midnite-studio',
    private: true,
    updatedAt: daysAgo(0.1),
    stars: 4,
    defaultBranch: 'main',
    languages: [
      { name: 'TypeScript', size: 15_126_703 },
      { name: 'JavaScript', size: 269_647 },
      { name: 'CSS', size: 242_670 },
      { name: 'Shell', size: 83_995 },
      { name: 'HTML', size: 53_857 },
    ],
  },
  {
    owner: 'bilo-io',
    name: 'pty-broker',
    fullName: 'bilo-io/pty-broker',
    url: 'https://github.com/bilo-io/pty-broker',
    private: false,
    updatedAt: daysAgo(21),
    stars: 128,
    defaultBranch: 'main',
    languages: [
      { name: 'Rust', size: 60_000 },
      { name: 'Go', size: 25_000 },
      { name: 'Python', size: 10_000 },
      { name: 'Makefile', size: 1_000 },
    ],
  },
  {
    owner: 'bilo-io',
    name: 'revix-website-testing',
    fullName: 'bilo-io/revix-website-testing',
    url: 'https://github.com/bilo-io/revix-website-testing',
    private: false,
    updatedAt: daysAgo(800),
    defaultBranch: 'master',
    languages: [{ name: 'JavaScript', size: 5_265 }],
  },
  {
    owner: 'bilo-io',
    name: 'empty-repo',
    fullName: 'bilo-io/empty-repo',
    url: 'https://github.com/bilo-io/empty-repo',
    private: true,
  },
];

for (const theme of ['dark', 'light'] as const) {
  test(`reachable repositories (${theme})`, async ({ page }) => {
    await page.route('https://github.com/**', (route) => route.abort());
    await stubGravatars(page);
    await page.addInitScript(
      (state: Record<string, unknown>) =>
        window.localStorage.setItem('midnite-studio.ui', JSON.stringify({ state, version: 23 })),
      { forgeActiveAccountId: ACCOUNT.id, forgeAccounts: [ACCOUNT] },
    );
    await installShotsBridge(page, { forgeAccounts: [ACCOUNT], reachableRepos: REPOS });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible({ timeout: 30_000 });
    await setReducedMotion(page);
    await setTheme(page, theme, { settleMs: 150 });
    await page.getByRole('button', { name: 'Settings' }).click();
    await page
      .getByRole('navigation', { name: 'Settings pages' })
      .getByRole('button', { name: 'Accounts', exact: true })
      .click();
    await page.getByRole('button', { name: 'Reachable repositories' }).click();
    const rows = page.getByTestId('reachable-repo-row');
    await expect(rows).toHaveCount(REPOS.length);
    const list = rows.first().locator('xpath=..');
    await list.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await list.screenshot({ path: shotPath(OUT, `reachable-repos-${theme}.png`) });
  });
}
