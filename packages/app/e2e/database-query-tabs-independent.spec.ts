import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 61 Theme G/J — two query tabs against the same connection keep
 * independent results: `query-results-store.ts` keys a run by tab id, and
 * switching tabs shows each one's own last streamed rows without re-running
 * anything (`use-query-stream.ts`'s own docblock on why the batch listener
 * subscribes once for the view rather than per active tab).
 */
const tabsFixtures: MockFixtures = {
  ...fixtures,
  dbConnections: [
    { id: 'c1', name: 'Local Postgres', provider: 'postgres', host: 'localhost', port: 5432, database: 'app' },
  ],
  dbSchemaByConnection: {
    c1: {
      tables: [
        {
          name: 'users',
          kind: 'table',
          columns: [{ name: 'id', type: 'int4', nullable: false, isPrimaryKey: true, references: null }],
        },
        {
          name: 'orders',
          kind: 'table',
          columns: [{ name: 'total', type: 'numeric', nullable: true, isPrimaryKey: false, references: null }],
        },
      ],
    },
  },
  dbTableRows: {
    users: { columns: ['id', 'email'], rows: [{ id: 1, email: 'ada@example.com' }] },
    orders: { columns: ['id', 'total'], rows: [{ id: 9, total: 42.5 }] },
  },
};

test('two query tabs against one connection stay independent', async ({ page }) => {
  await installMockBridge(page, tabsFixtures);
  await page.goto('/');
  await clickRailLink(page, 'Database');
  await page.getByRole('region', { name: 'Connections' }).getByText('Local Postgres').click();

  // Tab 1: users
  await page.getByLabel('Open query tab').click();
  await expect(page.getByRole('tab', { name: 'Query 1' })).toBeVisible();
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.type('SELECT * FROM users');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('ada@example.com')).toBeVisible();

  // Tab 2: orders, opened fresh via the strip's own "+"
  await page.getByLabel('New query tab').click();
  await expect(page.getByRole('tab', { name: 'Query 2' })).toBeVisible();
  await expect(page.getByText('ada@example.com')).not.toBeVisible();
  await expect(page.getByText('No results yet')).toBeVisible();

  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.type('SELECT * FROM orders');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('42.5')).toBeVisible();
  await expect(page.getByText('ada@example.com')).not.toBeVisible();

  // Switch back to tab 1: its own streamed rows are still there, with no
  // re-run — the mocked engine never sees a third `queryStart` for it.
  await page.getByRole('tab', { name: 'Query 1' }).click();
  await expect(page.getByText('ada@example.com')).toBeVisible();
  await expect(page.getByText('42.5')).not.toBeVisible();

  // And tab 2, switched back to, still shows its own.
  await page.getByRole('tab', { name: 'Query 2' }).click();
  await expect(page.getByText('42.5')).toBeVisible();
  await expect(page.getByText('ada@example.com')).not.toBeVisible();
});
