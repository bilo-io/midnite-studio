import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Find in files (Phase 24 Theme E): the search panel that replaces the tree
 * while a query is active, grouped results, and opening one at its line.
 */

const baseFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'repo:': [
      { name: 'src', kind: 'dir', size: 0, isIgnored: false },
      { name: 'README.md', kind: 'file', size: 40, isIgnored: false },
    ],
    'repo:src': [
      { name: 'main.ts', kind: 'file', size: 64, isIgnored: false },
      { name: 'palette.tsx', kind: 'file', size: 48, isIgnored: false },
    ],
  },
  fsFiles: {
    'repo:src/main.ts': {
      kind: 'text',
      content: 'const a = 1;\nfunction foo() {\n  return a;\n}\n',
      size: 64,
    },
    'repo:src/palette.tsx': {
      kind: 'text',
      content: 'export function foo() {\n  return null;\n}\n',
      size: 48,
    },
  },
};

async function openFiles(page: Page, fsSearchResult: MockFixtures['fsSearchResult']): Promise<void> {
  await installMockBridge(page, { ...baseFixtures, fsSearchResult });
  await page.goto('/');
  await page.getByRole('link', { name: 'Files' }).click();
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
}

test('typing a query replaces the tree with grouped results; clicking one opens the file at its line', async ({
  page,
}) => {
  await openFiles(page, {
    ok: true,
    matches: [
      { path: 'src/main.ts', line: 2, text: 'function foo() {' },
      { path: 'src/palette.tsx', line: 1, text: 'const fooBarBaz = 1;' },
    ],
    truncated: false,
  });

  await page.getByRole('textbox', { name: 'Find in files' }).fill('foo');

  // The tree is gone; the results are grouped, one heading per file.
  await expect(page.getByRole('treeitem', { name: /^src$/ })).toHaveCount(0);
  await expect(page.getByText('src/main.ts')).toBeVisible();
  await expect(page.getByText('src/palette.tsx')).toBeVisible();
  await expect(page.getByText('function foo() {')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: '../../docs/screenshots/phase-24-e/search-results.png' });

  await page.getByText('function foo() {').click();

  // The preview opened on the right file …
  await expect(page.getByText('read-only')).toBeVisible();
  // … and the matched line scrolled into view and flashed.
  const hitLine = page.locator('.code-preview-hit');
  await expect(hitLine).toBeVisible();
  await expect(hitLine).toContainText('function foo()');
  await page.waitForTimeout(200);
  await page.screenshot({ path: '../../docs/screenshots/phase-24-e/search-open-at-line.png' });

  // Clearing the query brings the tree back.
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('treeitem', { name: /^src$/ })).toBeVisible();
});

test('an empty match set reads as "tracked content only", not an ordinary no-match', async ({
  page,
}) => {
  await openFiles(page, { ok: true, matches: [], truncated: false });

  await page.getByRole('textbox', { name: 'Find in files' }).fill('zzz-nowhere');
  await expect(page.getByText('No tracked file matches')).toBeVisible();
  await expect(page.getByText(/tracked content only/)).toBeVisible();
});

test('a malformed regex surfaces as a search error, not a silent empty list', async ({ page }) => {
  await openFiles(page, { ok: false, message: 'fatal: bad pattern' });

  await page.getByRole('button', { name: 'Use regular expression' }).click();
  await page.getByRole('textbox', { name: 'Find in files' }).fill('(unterminated');

  await expect(page.getByText('Search failed')).toBeVisible();
  await expect(page.getByText('fatal: bad pattern')).toBeVisible();
});

test('a truncated result set says so', async ({ page }) => {
  await openFiles(page, {
    ok: true,
    matches: [{ path: 'src/main.ts', line: 2, text: 'function foo() {' }],
    truncated: true,
  });

  await page.getByRole('textbox', { name: 'Find in files' }).fill('foo');
  await expect(page.getByText(/narrow the query/)).toBeVisible();
});
