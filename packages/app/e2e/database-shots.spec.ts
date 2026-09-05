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
 * under `docs/screenshots/p61-abde/`, committed with PR #165; this batch
 * (Themes F/I) adds the schema tree under `docs/screenshots/p61-fi/` to the
 * same spec file rather than a 26th bespoke one. Themes G/H (query tabs,
 * results grid) are still out of scope, so there is no query-and-results or
 * conflict shot yet — those land with the phases that build them. Theme I's
 * confirm dialog reuses `confirm-dialog.tsx` pixel-for-pixel (no new visual
 * state of its own), so it gets no separate shot either.
 *
 * Uses the shared fixture helper (`shots-helper.ts`, Phase 56 Theme G)
 * rather than a bespoke bridge install.
 */
const OUT = '../../docs/screenshots/p61-abde';
const OUT_FI = '../../docs/screenshots/p61-fi';

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
});
