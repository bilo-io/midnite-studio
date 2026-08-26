import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Settings as pages (Phase 16): the bottom-pinned rail entry, the inner page
 * sidebar, and the Agent page — version card from the mocked probe plus the
 * ~/.claude tree through the claude-home scope.
 */

const settingsFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'claude:': [
      { name: 'skills', kind: 'dir', size: 0, isIgnored: false },
      { name: 'settings.json', kind: 'file', size: 88, isIgnored: false },
    ],
    'claude:skills': [{ name: 'brainstorm', kind: 'dir', size: 0, isIgnored: false }],
  },
  fsFiles: {
    'claude:settings.json': { kind: 'text', content: '{ "theme": "dark" }', size: 88 },
  },
};

async function openSettings(page: Page): Promise<void> {
  await installMockBridge(page, settingsFixtures);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('navigation', { name: 'Settings pages' })).toBeVisible();
}

test('settings is one bottom entry, not a workspace nav item', async ({ page }) => {
  await installMockBridge(page, settingsFixtures);
  await page.goto('/');

  // The rail's workspace links: Files, Graph, Changes — no Settings link.
  await expect(page.getByRole('link', { name: 'Files' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('all four pages are reachable through the inner sidebar', async ({ page }) => {
  await openSettings(page);

  const nav = page.getByRole('navigation', { name: 'Settings pages' });
  await expect(nav.getByRole('button', { name: 'Appearance' })).toBeVisible();

  await nav.getByRole('button', { name: 'Graph' }).click();
  await expect(page.getByRole('heading', { name: 'Graph' })).toBeVisible();

  await nav.getByRole('button', { name: 'Terminal' }).click();
  await expect(page.getByText('Agent roster')).toBeVisible();

  await nav.getByRole('button', { name: 'Appearance' }).click();
  await expect(page.getByText('Interface font')).toBeVisible();
});

test('the Agent page shows the version card and browses ~/.claude', async ({ page }) => {
  await openSettings(page);

  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Agent' })
    .click();

  // Version card, from the mocked login-shell probe.
  await expect(page.getByText('v2.1.34')).toBeVisible();
  await expect(page.getByText('via npm')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Uninstall…' })).toBeVisible();

  // The ~/.claude tree is lazy like the repo one.
  await expect(page.getByRole('treeitem', { name: /settings\.json/ })).toBeVisible();
  await page.getByRole('treeitem', { name: /^skills$/ }).click();
  await expect(page.getByRole('treeitem', { name: /brainstorm/ })).toBeVisible();

  await page.waitForTimeout(400);
  await page.screenshot({ path: '../../docs/screenshots/phase-16/settings-agent.png' });
});
