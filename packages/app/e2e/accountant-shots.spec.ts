import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { createMemoryLedger } from '../../features/ledger/renderer/memory-ledger';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink } from '../test-support/mock-bridge';
import { installMockBridge, prepareForVisualCapture } from './shots-helper';

/**
 * Playwright: the Accountant's books view inside Studio (Phase 129 Theme H) — Overview, the Journal with the
 * new-entry sheet open, the Balance sheet and the UK tax estimate.
 *
 * Needs a real browser for the real layout of the report page: a four-table report sits in a flex column with
 * right-aligned tabular figures, and jsdom reports every box as 0×0, so only Chromium can photograph that it
 * reads as a statement. Posting, the report maths and the tax rules are vitest.
 *
 * `buildMockBridge` is serialised into the page and cannot import the ledger, so the book lives in Node: the
 * spec builds the feature's in-memory ledger here and hands the page a bridge whose every op calls it through
 * `exposeFunction`. Shots go to MSTUDIO_SHOTS_DIR (default: the OS temp dir) and are never committed.
 */
const SHOTS = process.env.MSTUDIO_SHOTS_DIR ?? path.join(tmpdir(), 'midnite-shots-p129');

test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

const OPS = [
  'listBooks',
  'getBook',
  'createBook',
  'updateBook',
  'upsertAccount',
  'archiveAccount',
  'post',
  'reverse',
  'journal',
  'balances',
  'report',
  'exportReport',
  'importPick',
  'importPreview',
  'importCommit',
  'taxEstimate',
] as const;

async function openBooks(page: Page): Promise<void> {
  const ledger = createMemoryLedger({ jurisdiction: 'uk-ew-ni' });
  await page.exposeFunction('__ledgerCall', (op: (typeof OPS)[number], req: unknown) =>
    (ledger[op] as (r: unknown) => Promise<unknown>)(req),
  );
  await installMockBridge(page, fixtures);
  await page.addInitScript((ops: readonly string[]) => {
    const w = window as unknown as { midniteStudio: { ledger: Record<string, unknown> }; __ledgerCall: (op: string, req: unknown) => Promise<unknown> };
    const ledger: Record<string, unknown> = { onChanged: () => () => undefined };
    for (const op of ops) ledger[op] = (req: unknown) => w.__ledgerCall(op, req);
    w.midniteStudio.ledger = ledger;
  }, OPS);
  await page.goto('/');
  // `*-shots` closes the repos panel, so the Worktrees heading other specs wait on is not mounted.
  await expect(page.getByRole('link', { name: 'Books', exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Books');
    await expect(page.getByRole('tablist', { name: 'Books sections' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
  // The rail expands under the pointer and would cover the tab strip.
  await page.mouse.move(900, 500);
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await prepareForVisualCapture(page);
  await page.locator('div[aria-label="Books"]').screenshot({ path: path.join(SHOTS, name) });
}

test('Overview, Journal with the new-entry sheet, Balance sheet and the UK tax estimate render in the real layout', async ({ page }) => {
  test.setTimeout(120_000);
  await openBooks(page);

  await expect(page.getByLabel(/^Cash: /)).toBeVisible();
  await shoot(page, 'overview.png');

  await page.getByRole('tab', { name: 'Journal' }).click();
  await expect(page.getByText('Figma subscription')).toBeVisible();
  await page.getByRole('button', { name: 'New entry' }).click();
  await expect(page.getByRole('dialog', { name: 'New entry' })).toBeVisible();
  await shoot(page, 'journal-new-entry.png');
  // The sheet's Close button sits under the window title bar; Escape (from a field inside) closes it.
  await page.getByRole('dialog', { name: 'New entry' }).getByLabel('Description').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'New entry' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Reports' }).click();
  await page.getByRole('combobox', { name: 'Report' }).selectOption('balance-sheet');
  const sheet = page.getByRole('table', { name: 'Balance sheet', exact: true });
  await expect(sheet).toBeVisible();
  // Four-table report page: the figures column is right-aligned, so the amounts share one right edge.
  const edges = await sheet.locator('td.text-right').evaluateAll((cells) => cells.map((c) => Math.round(c.getBoundingClientRect().right)));
  expect(new Set(edges).size).toBe(1);
  await shoot(page, 'balance-sheet.png');

  await page.getByRole('tab', { name: 'Tax' }).click();
  await expect(page.getByRole('table', { name: 'Tax estimate', exact: true })).toBeVisible();
  await expect(page.getByRole('note', { name: 'Not tax advice' })).toContainText('not tax advice');
  await shoot(page, 'tax-estimate.png');
});
