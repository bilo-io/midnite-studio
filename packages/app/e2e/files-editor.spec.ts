import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The preview pane becomes an editor (Phase 24 Theme D): CodeMirror 6 behind
 * an explicit Edit toggle, Cmd+S through the command registry, and an
 * unsaved-changes guard on navigating away from a dirty buffer.
 */

const editorFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'repo:': [
      { name: 'a.ts', kind: 'file', size: 20, isIgnored: false },
      { name: 'b.ts', kind: 'file', size: 8, isIgnored: false },
    ],
  },
  fsFiles: {
    'repo:a.ts': {
      kind: 'text',
      content: 'const answer = 42;\n',
      size: 20,
      version: { mtimeMs: 1, size: 20 },
    },
    'repo:b.ts': { kind: 'text', content: 'const x = 1;\n', size: 8 },
  },
};

async function openFiles(page: Page): Promise<void> {
  await installMockBridge(page, editorFixtures);
  await page.goto('/');
  await clickRailLink(page, 'Explorer');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
}

test('Edit swaps the read-only preview for a CodeMirror editor with line numbers', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  // The static "read-only" label is only for what cannot be edited — a repo-
  // scope text file gets the Edit toggle in its place from the moment it loads.
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await expect(page.locator('.cm-gutters')).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('const answer = 42;');
  await page.screenshot({ path: '../../docs/screenshots/phase-24-d/editor-clean.png' });
});

test('typing shows a dirty indicator, and Save clears it', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();

  await page.locator('.cm-content').click();
  await page.keyboard.type('// edited\n');
  await expect(page.getByTitle('Unsaved changes')).toBeVisible();
  await page.screenshot({ path: '../../docs/screenshots/phase-24-d/editor-dirty.png' });

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTitle('Unsaved changes')).toHaveCount(0);
});

test('leaving a dirty file for another shows the Save/Discard/Cancel guard', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.type('x');

  await page.getByRole('treeitem', { name: /^b\.ts$/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Save changes to "a.ts"?');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Discard' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await page.screenshot({ path: '../../docs/screenshots/phase-24-d/editor-guard.png' });

  // Discard proceeds with the blocked navigation.
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('treeitem', { name: /^b\.ts$/ })).toHaveAttribute('aria-selected', 'true');
});

test('Cancel on the guard keeps the original file selected and the edit intact', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.type('x');

  await page.getByRole('treeitem', { name: /^b\.ts$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: /^a\.ts$/ })).toHaveAttribute('aria-selected', 'true');
  // Cancel keeps the edit — it neither saved nor discarded it.
  await expect(page.getByTitle('Unsaved changes')).toBeVisible();
});

test('a stale write on Save offers Reload rather than overwriting or discarding silently', async ({
  page,
}) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();

  // Simulate an external change landing on disk after the read.
  await page.evaluate(() => {
    (window as unknown as { __mstudioStaleFile: (relPath: string) => void }).__mstudioStaleFile('a.ts');
  });

  await page.locator('.cm-content').click();
  await page.keyboard.type('x');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText(/changed on disk/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep editing' })).toBeVisible();
});
