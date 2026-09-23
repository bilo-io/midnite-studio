import { expect, test } from '@playwright/test';

import type { ForgeAccount, ReachableRepo } from '@midnite/studio-shared';

import { installShotsBridge, setReducedMotion, setTheme, shotPath, stubGravatars } from './shots-helper';

/**
 * Ad hoc: the Reachable repositories row's trailing actions (open on the
 * forge, stage the provider CLI's delete in a terminal), for the PR body. Run
 * with `MSTUDIO_SHOTS=1`; skipped otherwise, like every other
 * `*-shots.spec.ts` — and excluded from the e2e budget by name. Needs a real
 * browser for the terminal pane the delete action opens (xterm).
 */
const OUT = '../../docs/screenshots/adhoc-reach-repo-actions';

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

const REPOS: ReachableRepo[] = [
  { owner: 'bilo-io', name: 'midnite-studio', fullName: 'bilo-io/midnite-studio', url: 'https://github.com/bilo-io/midnite-studio', webUrl: 'https://github.com/bilo-io/midnite-studio', private: false },
  { owner: 'bilo-io', name: 'dotfiles', fullName: 'bilo-io/dotfiles', url: 'https://github.com/bilo-io/dotfiles', webUrl: 'https://github.com/bilo-io/dotfiles', private: true },
  { owner: 'bilo-io', name: 'midnite-apps', fullName: 'bilo-io/midnite-apps', url: 'https://github.com/bilo-io/midnite-apps', webUrl: 'https://github.com/bilo-io/midnite-apps', private: false },
];

test('Settings ▸ Accounts ▸ Reachable repositories actions', async ({ page }) => {
  await page.route('https://github.com/**', (route) => route.abort());
  await stubGravatars(page);
  await page.addInitScript(
    (state: Record<string, unknown>) =>
      window.localStorage.setItem('midnite-studio.ui', JSON.stringify({ state, version: 23 })),
    { forgeActiveAccountId: ACCOUNT.id, forgeAccounts: [ACCOUNT] },
  );
  await installShotsBridge(page, { forgeAccounts: [ACCOUNT] });
  // The mock bridge answers `unsupported`; patch in a listing after it installs.
  await page.addInitScript((repos: ReachableRepo[]) => {
    const bridge = (window as unknown as { midniteStudio: { forgeAccounts: Record<string, unknown> } }).midniteStudio;
    bridge.forgeAccounts['reachableRepos'] = async () => ({ ok: true, repos });
  }, REPOS);
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible({ timeout: 30_000 });
  await setReducedMotion(page);
  await setTheme(page, 'dark', { settleMs: 150 });

  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Accounts', exact: true })
    .click();
  const heading = page.getByRole('button', { name: /Reachable repositories/ });
  await heading.scrollIntoViewIfNeeded();
  if ((await heading.getAttribute('aria-expanded')) !== 'true') await heading.click();
  const firstDelete = page.getByRole('button', { name: /Delete bilo-io\/midnite-studio/ });
  await expect(firstDelete).toBeVisible();
  const section = firstDelete.locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]/..');
  await firstDelete.hover();
  await page.waitForTimeout(600);
  await section.screenshot({ path: shotPath(OUT, 'row-actions.png') });

  await firstDelete.click();
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: shotPath(OUT, 'delete-staged.png') });
});
