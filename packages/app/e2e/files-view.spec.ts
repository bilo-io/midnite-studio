import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Folder view (Phase 16): lazy tree, gitignore dimming, and the read-only
 * preview pane — text through the mocked fs bridge, markdown with its
 * source ⇄ rendered toggle, and the binary fallback card.
 */

const filesFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'repo:': [
      { name: 'src', kind: 'dir', size: 0, isIgnored: false },
      { name: 'node_modules', kind: 'dir', size: 0, isIgnored: true },
      { name: 'README.md', kind: 'file', size: 120, isIgnored: false },
      { name: 'logo.bin', kind: 'file', size: 2048, isIgnored: false },
    ],
    'repo:src': [{ name: 'main.ts', kind: 'file', size: 64, isIgnored: false }],
  },
  fsFiles: {
    'repo:README.md': {
      kind: 'text',
      content: '# Midnite\n\nA **git client**. See [the site](https://example.com).',
      size: 120,
    },
    'repo:src/main.ts': { kind: 'text', content: 'const answer = 42;\n', size: 64 },
    'repo:logo.bin': { kind: 'binary', size: 2048 },
  },
};

async function openFiles(page: Page): Promise<void> {
  await installMockBridge(page, filesFixtures);
  await page.goto('/');
  await page.getByRole('link', { name: 'Folder' }).click();
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
}

test('lazy tree: children appear on expand, ignored entries render dimmed', async ({ page }) => {
  await openFiles(page);

  // Root listing shows; src's children don't exist yet (lazy).
  await expect(page.getByRole('treeitem', { name: /^src$/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /main\.ts/ })).toHaveCount(0);

  await page.getByRole('treeitem', { name: /^src$/ }).click();
  await expect(page.getByRole('treeitem', { name: /main\.ts/ })).toBeVisible();

  // The gitignored directory is present but dimmed, and never auto-expanded.
  const ignored = page.getByRole('treeitem', { name: /node_modules/ });
  await expect(ignored).toHaveClass(/opacity-45/);
});

test('selecting a code file shows the read-only highlighted preview', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /^src$/ }).click();
  await page.getByRole('treeitem', { name: /main\.ts/ }).click();

  await expect(page.getByText('read-only')).toBeVisible();
  await expect(page.getByText('const answer = 42;')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '../../docs/screenshots/phase-16/files-code.png' });
});

test('markdown renders, and the toggle reveals the source', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /README\.md/ }).click();
  // Rendered: the strong tag exists, the literal asterisks don't.
  await expect(page.getByText('git client', { exact: true })).toBeVisible();
  await expect(page.getByText('**git client**')).toHaveCount(0);

  // Links are live now that Phase 12 E has landed, and route through the
  // guarded `shell:open-external` channel rather than navigating this window —
  // which, in a `file://` SPA with no browser chrome, would be one-way.
  const link = page.getByRole('link', { name: 'the site' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole('button', { name: 'Source' })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as never as { __mgitExternalUrls: string[] }).__mgitExternalUrls,
    ),
  ).toHaveLength(1);

  await page.getByRole('button', { name: 'Source' }).click();
  await expect(page.getByText(/\*\*git client\*\*/)).toBeVisible();
});

test('a binary file gets the fallback card, not a preview', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /logo\.bin/ }).click();
  await expect(page.getByText(/Binary file · 2\.0 KB/)).toBeVisible();
});
