import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 61 Theme I/J — the destructive-statement safety gate
 * (`statement-confirm.ts`), exercised end to end: a write statement is
 * blocked behind the app's own blast-radius confirm dialog
 * (`confirm-dialog.tsx`) until the user explicitly confirms it, and a plain
 * read never shows one at all.
 */
const destructiveFixtures: MockFixtures = {
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
          columns: [
            { name: 'id', type: 'int4', nullable: false, isPrimaryKey: true, references: null },
            { name: 'email', type: 'text', nullable: false, isPrimaryKey: false, references: null },
          ],
        },
      ],
    },
  },
  dbTableRows: {
    users: {
      columns: ['id', 'email'],
      rows: [
        { id: 1, email: 'ada@example.com' },
        { id: 2, email: 'grace@example.com' },
        { id: 3, email: 'bo@example.com' },
      ],
    },
  },
};

async function openQueryTab(page: import('@playwright/test').Page): Promise<void> {
  await installMockBridge(page, destructiveFixtures);
  await page.goto('/');
  await clickRailLink(page, 'Database');
  await page.getByRole('region', { name: 'Connections' }).getByText('Local Postgres').click();
  await page.getByLabel('Open query tab').click();
  await expect(page.getByRole('tab', { name: 'Query 1' })).toBeVisible();
}

test('a destructive statement is blocked behind a confirm dialog until confirmed', async ({ page }) => {
  await openQueryTab(page);

  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.type('DELETE FROM users');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Run this statement?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('DELETE FROM users');
  await expect(dialog).toContainText('Local Postgres');

  // Blocked: nothing has run yet — the empty state from before the confirm
  // is still what renders, not a row count.
  await expect(page.getByText('No results yet')).toBeVisible();

  await dialog.getByRole('button', { name: 'Run statement' }).click();
  await expect(dialog).not.toBeVisible();

  // Only once confirmed does the statement actually run.
  await expect(page.getByText('3 rows')).toBeVisible();
});

test('a plain read never shows the confirm dialog', async ({ page }) => {
  await openQueryTab(page);

  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.type('SELECT * FROM users');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  await expect(page.getByRole('dialog', { name: 'Run this statement?' })).not.toBeVisible();
  await expect(page.getByText('ada@example.com')).toBeVisible();
});
