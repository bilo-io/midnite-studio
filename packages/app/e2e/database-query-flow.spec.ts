import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 61 Theme J — the whole-loop happy path: Database in the Workspace
 * nav, add a SQLite connection through the real `ConnectionDialog` form,
 * browse the schema tree it introspects, open a query tab, run a `SELECT`,
 * see rows.
 *
 * The saved connection's id is minted by `crypto.randomUUID()`
 * (`connection-dialog.tsx`'s `buildConfig`) — unknowable to this fixture in
 * advance — so `dbSchemaByConnection` seeds its `'*'` fallback rather than a
 * specific id (see `mock-bridge.ts`'s own doc comment on that field).
 */
const queryFlowFixtures: MockFixtures = {
  ...fixtures,
  dbSchemaByConnection: {
    '*': {
      tables: [
        {
          name: 'users',
          kind: 'table',
          columns: [
            { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, references: null },
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
      ],
    },
  },
};

test('add a SQLite connection, browse its schema, run a SELECT, see rows', async ({ page }) => {
  await installMockBridge(page, queryFlowFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await clickRailLink(page, 'Database');
  await expect(page.getByText('No connections yet')).toBeVisible();

  // --- add a SQLite connection ---------------------------------------------
  await page.getByLabel('New connection').click();
  const dialog = page.getByRole('dialog', { name: 'New connection' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Name', { exact: true }).fill('Local SQLite');
  await dialog.getByLabel('Provider').selectOption('sqlite');
  await dialog.getByLabel('File path').fill('/tmp/mstudio-e2e.db');
  await dialog.getByLabel('Database').fill('main');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog).not.toBeVisible();
  const connectionsRegion = page.getByRole('region', { name: 'Connections' });
  await expect(connectionsRegion.getByText('Local SQLite').first()).toBeVisible();
  await expect(connectionsRegion.getByText('sqlite').first()).toBeVisible();

  // --- browse the schema tree ----------------------------------------------
  const usersRow = page.getByRole('button', { name: /^users/ });
  await usersRow.waitFor();
  await usersRow.click();
  await expect(page.getByText('email')).toBeVisible();
  await expect(page.getByLabel('Primary key')).toBeVisible();

  // --- open a query tab and run a SELECT ------------------------------------
  await page.getByLabel('Open query tab').click();
  await expect(page.getByRole('tab', { name: 'Query 1' })).toBeVisible();

  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.type('SELECT * FROM users');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  await expect(page.getByText('ada@example.com')).toBeVisible();
  await expect(page.getByText('grace@example.com')).toBeVisible();
  await expect(page.getByText(/2 rows/)).toBeVisible();
});
