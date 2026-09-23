import { expect, test, type Page } from '@playwright/test';

import type { ForgeAccount } from '@midnite/studio-shared';

import { installShotsBridge, setReducedMotion, setTheme, shotPath, stubGravatars } from './shots-helper';

/**
 * Phase 90 Theme L: the account switcher at each `forgeSwitcherPlacement`,
 * for the PR body. Run with `MSTUDIO_SHOTS=1`; skipped otherwise, like every
 * other `*-shots.spec.ts` — and excluded from the e2e budget by name.
 */
const OUT = '../../docs/screenshots/p90-l-account-switcher';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });

const ACCOUNTS: ForgeAccount[] = [
  {
    id: 'gitlab:gitlab.com:octocat',
    kind: 'gitlab',
    host: 'gitlab.com',
    login: 'octocat',
    displayName: 'The Octocat',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
  },
  {
    id: 'github:github.com:bilo-io',
    kind: 'github',
    host: 'github.com',
    login: 'bilo-io',
    displayName: 'Bilo',
    avatarUrl: null,
    addedAt: 0,
    hasToken: false,
    delegated: 'gh',
  },
  {
    id: 'azure:dev.azure.com:bilo',
    kind: 'azure',
    host: 'dev.azure.com',
    login: 'bilo',
    displayName: 'Bilo (Azure)',
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
  },
];

async function open(
  page: Page,
  placement: string,
  { accounts = ACCOUNTS, navMode = 'auto' }: { accounts?: ForgeAccount[]; navMode?: string } = {},
) {
  await page.route('https://github.com/**', (route) => route.abort());
  await stubGravatars(page);
  await page.addInitScript(
    (state: Record<string, unknown>) =>
      window.localStorage.setItem('midnite-studio.ui', JSON.stringify({ state, version: 23 })),
    {
      forgeSwitcherPlacement: placement,
      forgeActiveAccountId: accounts[0]?.id ?? null,
      forgeAccounts: accounts,
      navMode,
    },
  );
  await installShotsBridge(page, { forgeAccounts: accounts });
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible({
    timeout: 30_000,
  });
  await setReducedMotion(page);
}

const titleBar = (page: Page) => page.getByRole('banner', { name: 'Window title bar' });

for (const theme of ['dark', 'light'] as const) {
  test(`titlebar-right, menu open (${theme})`, async ({ page }) => {
    await open(page, 'titlebar-right');
    await setTheme(page, theme, { settleMs: 150 });
    await page.getByRole('button', { name: /switch account/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: shotPath(OUT, `titlebar-right-menu-${theme}.png`),
      clip: { x: 700, y: 0, width: 700, height: 330 },
    });
  });
}

test('titlebar-left', async ({ page }) => {
  await open(page, 'titlebar-left');
  await setTheme(page, 'dark', { settleMs: 150 });
  await titleBar(page).screenshot({ path: shotPath(OUT, 'titlebar-left.png') });
});

test('rail-top, expanded', async ({ page }) => {
  await open(page, 'rail-top', { navMode: 'expanded' });
  await setTheme(page, 'dark', { settleMs: 250 });
  await page.screenshot({
    path: shotPath(OUT, 'rail-top.png'),
    clip: { x: 0, y: 0, width: 300, height: 260 },
  });
});

test('rail-bottom, expanded', async ({ page }) => {
  await open(page, 'rail-bottom', { navMode: 'expanded' });
  await setTheme(page, 'dark', { settleMs: 250 });
  await page.screenshot({
    path: shotPath(OUT, 'rail-bottom-expanded.png'),
    clip: { x: 0, y: 820 - 240, width: 300, height: 240 },
  });
});

test('hidden', async ({ page }) => {
  await open(page, 'hidden');
  await setTheme(page, 'dark', { settleMs: 150 });
  await titleBar(page).screenshot({ path: shotPath(OUT, 'hidden.png') });
});

test('zero accounts — Add account placeholder', async ({ page }) => {
  await open(page, 'titlebar-right', { accounts: [] });
  await setTheme(page, 'dark', { settleMs: 150 });
  await page.screenshot({
    path: shotPath(OUT, 'zero-accounts.png'),
    clip: { x: 900, y: 0, width: 500, height: 48 },
  });
});

test('Settings ▸ Accounts placement select', async ({ page }) => {
  await open(page, 'titlebar-right');
  await setTheme(page, 'dark', { settleMs: 150 });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Accounts', exact: true })
    .click();
  const select = page.getByRole('combobox', { name: 'Account switcher placement' });
  await select.scrollIntoViewIfNeeded();
  await select.locator('xpath=ancestor::div[contains(@class,"flex-col")][1]').screenshot({
    path: shotPath(OUT, 'settings-placement.png'),
  });
});
