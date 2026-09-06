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
 * The committed screenshots for Phase 61. Themes A/B/D/E's shell shots live
 * under `docs/screenshots/p61-abde/`, committed with PR #165; Themes F/I
 * added the schema tree under `docs/screenshots/p61-fi/` (PR #211). This
 * batch (Theme J) adds the remaining three states the phase doc's own Theme
 * J item names — a query tab with results, the run-statement confirm
 * dialog, and a staleness-conflict row — under `docs/screenshots/p61-j/`, to
 * this SAME spec file rather than a 26th bespoke one.
 *
 * Uses the shared fixture helper (`shots-helper.ts`, Phase 56 Theme G)
 * rather than a bespoke bridge install. The query-tab shots additionally
 * seed `dbTableRows` (Theme J's mocked SQL engine, `mock-bridge.ts`) so a
 * `SELECT * FROM orders` has real rows to stream, and the conflict shot uses
 * the same `__mstudioDbWrite` hook Theme J's own functional specs use to
 * manufacture a concurrent write.
 */
const OUT = '../../docs/screenshots/p61-abde';
const OUT_FI = '../../docs/screenshots/p61-fi';
const OUT_J = '../../docs/screenshots/p61-j';

const SEEDED_CONNECTION = {
  id: 'c1',
  name: 'Local Postgres',
  provider: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'app_user',
};

const SEEDED_SCHEMA = {
  tables: [
    {
      name: 'orders',
      schema: 'public',
      kind: 'table' as const,
      columns: [
        { name: 'id', type: 'int4', nullable: false, isPrimaryKey: true, references: null },
        {
          name: 'customer_id',
          type: 'int4',
          nullable: false,
          isPrimaryKey: false,
          references: { table: 'customers', column: 'id' },
        },
        { name: 'total', type: 'numeric', nullable: true, isPrimaryKey: false, references: null },
        { name: 'created_at', type: 'timestamptz', nullable: false, isPrimaryKey: false, references: null },
      ],
    },
    {
      name: 'order_totals',
      schema: 'public',
      kind: 'view' as const,
      columns: [
        { name: 'total', type: 'numeric', nullable: true, isPrimaryKey: false, references: null },
      ],
    },
  ],
};

/** Seed rows for the mocked SQL engine's `orders` table — the same shape `SEEDED_SCHEMA` describes. */
const SEEDED_ORDERS_ROWS = {
  orders: {
    columns: ['id', 'customer_id', 'total', 'created_at'],
    rows: [
      { id: 101, customer_id: 42, total: 129.99, created_at: '2026-08-01T10:00:00Z' },
      { id: 102, customer_id: 17, total: 54.5, created_at: '2026-08-02T14:30:00Z' },
    ],
  },
};

async function openDatabase(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Database');
  await settle(page, 300);
}

/** Opens a query tab on `SEEDED_CONNECTION` and types (but does not run) `sql`. */
async function openQueryTabWithSql(page: Page, sql: string): Promise<void> {
  await page.getByRole('region', { name: 'Connections' }).getByText('Local Postgres').click();
  await page.getByLabel('Open query tab').click();
  await page.getByRole('tab', { name: 'Query 1' }).waitFor();
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.type(sql);
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

  test('the schema tree, light', async ({ page }) => {
    await openDatabase(page, {
      ...fixtures,
      dbConnections: [SEEDED_CONNECTION],
      dbSchemaByConnection: { c1: SEEDED_SCHEMA },
    });
    await page.getByRole('region', { name: 'Connections' }).getByText('Local Postgres').click();
    await page.getByRole('button', { name: /^orders/ }).waitFor();
    await page.getByRole('button', { name: /^orders/ }).click();
    await page.getByText('customer_id').waitFor();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT_FI, 'database-schema-tree-light.png') });
  });

  test('the schema tree, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openDatabase(page, {
      ...fixtures,
      dbConnections: [SEEDED_CONNECTION],
      dbSchemaByConnection: { c1: SEEDED_SCHEMA },
    });
    await page.getByRole('region', { name: 'Connections' }).getByText('Local Postgres').click();
    await page.getByRole('button', { name: /^orders/ }).waitFor();
    await page.getByRole('button', { name: /^orders/ }).click();
    await page.getByText('customer_id').waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT_FI, 'database-schema-tree-dark.png') });
  });

  test('a query tab with results, light', async ({ page }) => {
    await openDatabase(page, {
      ...fixtures,
      dbConnections: [SEEDED_CONNECTION],
      dbSchemaByConnection: { c1: SEEDED_SCHEMA },
      dbTableRows: SEEDED_ORDERS_ROWS,
    });
    await openQueryTabWithSql(page, 'SELECT * FROM orders');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByText('129.99').waitFor();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT_J, 'database-query-results-light.png') });
  });

  test('a query tab with results, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openDatabase(page, {
      ...fixtures,
      dbConnections: [SEEDED_CONNECTION],
      dbSchemaByConnection: { c1: SEEDED_SCHEMA },
      dbTableRows: SEEDED_ORDERS_ROWS,
    });
    await openQueryTabWithSql(page, 'SELECT * FROM orders');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByText('129.99').waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT_J, 'database-query-results-dark.png') });
  });

  test('the run-statement confirm dialog, light', async ({ page }) => {
    await openDatabase(page, {
      ...fixtures,
      dbConnections: [SEEDED_CONNECTION],
      dbSchemaByConnection: { c1: SEEDED_SCHEMA },
      dbTableRows: SEEDED_ORDERS_ROWS,
    });
    await openQueryTabWithSql(page, 'DELETE FROM orders');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('dialog', { name: 'Run this statement?' }).waitFor();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT_J, 'database-confirm-dialog-light.png') });
  });

  test('the run-statement confirm dialog, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openDatabase(page, {
      ...fixtures,
      dbConnections: [SEEDED_CONNECTION],
      dbSchemaByConnection: { c1: SEEDED_SCHEMA },
      dbTableRows: SEEDED_ORDERS_ROWS,
    });
    await openQueryTabWithSql(page, 'DELETE FROM orders');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('dialog', { name: 'Run this statement?' }).waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT_J, 'database-confirm-dialog-dark.png') });
  });

  test('a staleness conflict row, light', async ({ page }) => {
    await openDatabase(page, {
      ...fixtures,
      dbConnections: [SEEDED_CONNECTION],
      dbSchemaByConnection: { c1: SEEDED_SCHEMA },
      dbTableRows: SEEDED_ORDERS_ROWS,
    });
    await openQueryTabWithSql(page, 'SELECT * FROM orders');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByText('129.99').waitFor();
    // Manufacture a concurrent write — the same __mstudioDbWrite hook Theme
    // J's functional specs use — landing between this row's initial SELECT
    // and the edit below.
    await page.evaluate(() => {
      (window as unknown as { __mstudioDbWrite: (t: string, m: object, p: object) => void }).__mstudioDbWrite(
        'orders',
        { id: 101 },
        { total: 999.99 },
      );
    });
    await page.getByText('129.99').dblclick();
    const input = page.locator('[data-index="0"] input');
    await input.fill('150.00');
    await input.press('Enter');
    await page.getByRole('button', { name: 'Submit 1 edit' }).click();
    await page.locator('[aria-label="Unsaved edit"]').waitFor();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT_J, 'database-edit-conflict-light.png') });
  });

  test('a staleness conflict row, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openDatabase(page, {
      ...fixtures,
      dbConnections: [SEEDED_CONNECTION],
      dbSchemaByConnection: { c1: SEEDED_SCHEMA },
      dbTableRows: SEEDED_ORDERS_ROWS,
    });
    await openQueryTabWithSql(page, 'SELECT * FROM orders');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByText('129.99').waitFor();
    await page.evaluate(() => {
      (window as unknown as { __mstudioDbWrite: (t: string, m: object, p: object) => void }).__mstudioDbWrite(
        'orders',
        { id: 101 },
        { total: 999.99 },
      );
    });
    await page.getByText('129.99').dblclick();
    const input = page.locator('[data-index="0"] input');
    await input.fill('150.00');
    await input.press('Enter');
    await page.getByRole('button', { name: 'Submit 1 edit' }).click();
    await page.locator('[aria-label="Unsaved edit"]').waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT_J, 'database-edit-conflict-dark.png') });
  });
});
