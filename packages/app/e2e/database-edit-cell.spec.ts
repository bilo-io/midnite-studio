import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 61 Theme H/J — the inline-editing round trip against the mocked SQL
 * engine (`mock-bridge.ts`): double-click a cell, submit, re-run the query
 * and see the edit stick; and the case Decision 2's staleness re-check
 * exists for, manufactured with `__mstudioDbWrite` (`mock-bridge.ts`'s own
 * doc comment on `dbTableRows`) since there is no second real connection to
 * race in this suite.
 */
const editFixtures: MockFixtures = {
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
      rows: [{ id: 1, email: 'ada@example.com' }],
    },
  },
};

async function runUsersQuery(page: Page): Promise<void> {
  await installMockBridge(page, editFixtures);
  await page.goto('/');
  await clickRailLink(page, 'Database');
  await page.getByRole('region', { name: 'Connections' }).getByText('Local Postgres').click();
  await page.getByLabel('Open query tab').click();
  await expect(page.getByRole('tab', { name: 'Query 1' })).toBeVisible();

  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.type('SELECT * FROM users');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('ada@example.com')).toBeVisible();
}

test('edit a cell, submit, and a re-query sees the change', async ({ page }) => {
  await runUsersQuery(page);

  await page.getByText('ada@example.com').dblclick();
  const input = page.locator('[data-index="0"] input');
  await input.fill('ada2@example.com');
  await input.press('Enter');

  await expect(page.getByRole('button', { name: 'Submit 1 edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit 1 edit' }).click();

  // Submitted cleanly: no conflict, so the toolbar reverts to Export CSV. The
  // grid keeps rendering its own streamed snapshot until the next run — it
  // does not locally patch the cell — which is exactly what the re-query
  // below is for.
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();

  // Re-query: the mocked engine's UPDATE mutated its in-memory table, so a
  // fresh SELECT reads back the edit rather than the original value.
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('ada2@example.com')).toBeVisible();
  await expect(page.getByText('ada@example.com')).not.toBeVisible();
});

test('a manufactured staleness conflict blocks the update and keeps the edit pending', async ({ page }) => {
  await runUsersQuery(page);

  // Simulate a concurrent write landing between this tab's initial SELECT and
  // the edit it is about to submit — the exact race Decision 2's staleness
  // re-check exists to catch.
  await page.evaluate(() => {
    (window as unknown as {
      __mstudioDbWrite: (table: string, match: Record<string, unknown>, patch: Record<string, unknown>) => void;
    }).__mstudioDbWrite('users', { id: 1 }, { email: 'concurrent@example.com' });
  });

  await page.getByText('ada@example.com').dblclick();
  const input = page.locator('[data-index="0"] input');
  await input.fill('ada2@example.com');
  await input.press('Enter');

  await page.getByRole('button', { name: 'Submit 1 edit' }).click();

  // Conflicted: the edit stays pending (still "Submit 1 edit", still the
  // unsaved-edit dot) rather than silently applying over a row that moved.
  await expect(page.locator('[aria-label="Unsaved edit"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit 1 edit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).not.toBeVisible();

  // And nothing was written: a re-query reads back the concurrent write, not
  // this tab's own edit.
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('concurrent@example.com')).toBeVisible();
  await expect(page.getByText('ada2@example.com')).not.toBeVisible();
});
