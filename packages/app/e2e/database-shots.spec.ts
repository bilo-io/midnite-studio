import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  settle,
  setTheme,
  shotPath,
  type MockFixtures,
} from './shots-helper';

/**
 * The committed screenshots for Phase 61 Themes A/B/D/E — the shell only.
 * Themes F/G/H (schema tree, query tabs, results grid) are out of scope for
 * this batch, so there is no query-and-results or confirm/conflict shot yet;
 * those land with the phases that build them.
 *
 * Uses the shared fixture helper (`shots-helper.ts`, Phase 56 Theme G)
 * rather than a bespoke bridge install.
 */
const OUT = '../../docs/screenshots/p61-abde';

const SEEDED_CONNECTION = {
  id: 'c1',
  name: 'Local Postgres',
  provider: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'app_user',
};

async function openDatabase(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Database');
  await settle(page, 300);
}

test.describe('database screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

  test('the empty state, light', async ({ page }) => {
    await openDatabase(page, { ...fixtures, dbConnections: [] });
    await page.getByText('No connections yet').waitFor();
    await page.screenshot({ path: shotPath(OUT, 'database-empty-light.png') });
  });

  test('the empty state, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openDatabase(page, { ...fixtures, dbConnections: [] });
    await page.getByText('No connections yet').waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT, 'database-empty-dark.png') });
  });

  test('a connected list, light', async ({ page }) => {
    await openDatabase(page, { ...fixtures, dbConnections: [SEEDED_CONNECTION] });
    await page.getByText('Local Postgres').waitFor();
    await page.screenshot({ path: shotPath(OUT, 'database-connected-light.png') });
  });

  test('a connected list, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openDatabase(page, { ...fixtures, dbConnections: [SEEDED_CONNECTION] });
    await page.getByText('Local Postgres').waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT, 'database-connected-dark.png') });
  });

  test('the new-connection dialog, light', async ({ page }) => {
    await openDatabase(page, { ...fixtures, dbConnections: [] });
    await page.getByLabel('New connection').click();
    await page.getByRole('dialog', { name: 'New connection' }).waitFor();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, 'database-new-connection-dialog-light.png') });
  });

  test('the new-connection dialog, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openDatabase(page, { ...fixtures, dbConnections: [] });
    await page.getByLabel('New connection').click();
    await page.getByRole('dialog', { name: 'New connection' }).waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT, 'database-new-connection-dialog-dark.png') });
  });
});
