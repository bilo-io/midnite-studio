import { expect, test, type Page } from '@playwright/test';

import type { ForgeAccount } from '@midnite/studio-shared';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  prepareForVisualCapture,
  setShotViewport,
  stubGravatars,
} from '../shots-helper';

/**
 * The forge account switcher (Phase 90 Theme L) — four locator crops.
 *
 * `account-switcher.test.tsx` proves the rows, roles, active check, slot
 * selection and store writes under jsdom; none of that can say whether the
 * avatar-plus-brand-badge glyph reads at 14px, whether the rail row lines up
 * with the lock button under it, or whether the placeholder reads as an
 * affordance rather than a hole. Those are appearance, which is this lane's.
 *
 * Avatars are forced onto their deterministic initials fallback: the real
 * `github.com/<login>.png` fetch would make the baseline depend on a network
 * and on whatever picture an account holder uploaded last.
 */
const gitlab: ForgeAccount = {
  id: 'gitlab:gitlab.com:octocat',
  kind: 'gitlab',
  host: 'gitlab.com',
  login: 'octocat',
  displayName: 'The Octocat',
  avatarUrl: null,
  addedAt: 0,
  hasToken: true,
  delegated: null,
};

const github: ForgeAccount = {
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

// The first spec in a run pays the Vite dev server's cold start.
test.describe.configure({ timeout: 60_000 });

async function open(
  page: Page,
  {
    accounts,
    placement,
  }: { accounts: ForgeAccount[]; placement: 'titlebar-right' | 'titlebar-left' | 'rail-bottom' },
): Promise<void> {
  const data: MockFixtures = { ...fixtures, forgeAccounts: accounts };
  await page.route('https://github.com/**', (route) => route.abort());
  await stubGravatars(page);
  /*
    Seeded at the store's CURRENT persist version, not through `seedUiState`
    (which writes v18): the v21 → v22 migration resets `forgeActiveAccountId`
    to null, which would leave every crop showing "Choose account" instead
    of an active avatar. Nothing after v22 touches it.
  */
  await page.addInitScript(
    (state: Record<string, unknown>) =>
      window.localStorage.setItem('midnite-studio.ui', JSON.stringify({ state, version: 23 })),
    {
      forgeSwitcherPlacement: placement,
      forgeActiveAccountId: accounts[0]?.id ?? null,
      forgeAccounts: accounts,
    },
  );
  await installMockBridge(page, data);
  await setShotViewport(page, { width: 1280, height: 800 });
  await page.goto('/');
  // A cold Vite dev server can take a while to serve the first module graph.
  await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible({
    timeout: 30_000,
  });
}

test('the open menu at titlebar-right', async ({ page }) => {
  await open(page, { accounts: [gitlab, github], placement: 'titlebar-right' });
  await page.getByRole('button', { name: /switch account/ }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitemradio', { name: 'The Octocat' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await prepareForVisualCapture(page);
  await expect(menu).toHaveScreenshot('account-switcher-menu-titlebar-right.png');
});

test('the closed switcher at titlebar-left, after back/forward and reload', async ({ page }) => {
  await open(page, { accounts: [gitlab, github], placement: 'titlebar-left' });
  const button = page.locator('[data-account-switcher="titlebar"]');
  await expect(button).toBeVisible();
  await prepareForVisualCapture(page);
  // `TitleBarNav`'s own row: history, reload, the switcher, then the
  // breadcrumbs (fixture repo data, deterministic) — the placement is only
  // legible against the controls on either side of it.
  await expect(button.locator('..')).toHaveScreenshot('account-switcher-titlebar-left.png');
});

test('the closed switcher at rail-bottom, above the lock button', async ({ page }) => {
  await open(page, { accounts: [gitlab, github], placement: 'rail-bottom' });
  const row = page.locator('[data-account-switcher="rail"]');
  await expect(row).toBeVisible();
  await prepareForVisualCapture(page);
  await expect(row.locator('..')).toHaveScreenshot('account-switcher-rail-bottom.png');
});

test('the zero-account Add account affordance', async ({ page }) => {
  await open(page, { accounts: [], placement: 'titlebar-right' });
  const button = page.getByRole('button', { name: 'Add account' });
  await expect(button).toBeVisible();
  await prepareForVisualCapture(page);
  await expect(button).toHaveScreenshot('account-switcher-add-account.png');
});
