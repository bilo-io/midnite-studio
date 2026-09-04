import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Files view learns to write (Phase 24 Theme C): a context menu on every
 * row, inline create/rename, and delete behind a blast-radius confirm. Every
 * write here mutates the mock bridge's own `fsDirs`/`fsFiles` fixtures rather
 * than returning a fixed `{ok:true}` — per Phase 20's rule, a write that
 * changed nothing must not pass.
 */

const writeFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'repo:': [
      { name: 'src', kind: 'dir', size: 0, isIgnored: false },
      { name: 'README.md', kind: 'file', size: 120, isIgnored: false },
    ],
    'repo:src': [{ name: 'main.ts', kind: 'file', size: 64, isIgnored: false }],
  },
  fsFiles: {
    'repo:README.md': { kind: 'text', content: '# Midnite\n', size: 120 },
    'repo:src/main.ts': { kind: 'text', content: 'const answer = 42;\n', size: 64 },
  },
};

async function openFiles(page: Page): Promise<void> {
  await installMockBridge(page, writeFixtures);
  await page.goto('/');
  await clickRailLink(page, 'Explorer');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
}

test('right-click on a file offers New/Rename/Delete/Reveal/Copy', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /README\.md/ }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Reveal in Finder' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Copy Relative Path' })).toBeVisible();
  // A file cannot contain children.
  await expect(page.getByRole('menuitem', { name: 'New File' })).toHaveCount(0);
  // Phase 56 Theme F: this test's own assertions are the coverage, so only
  // the incidental screenshot is gated — an unconditional skip would drop
  // real functional coverage on every routine run.
  if (process.env.MSTUDIO_SHOTS) {
    await page.screenshot({ path: '../../docs/screenshots/phase-24-c/context-menu.png' });
  }
});

test('right-click on empty tree space offers only New File/New Folder', async ({ page }) => {
  await openFiles(page);

  // `role=tree` is `h-full` precisely so the empty area below the last row is
  // still part of it, the way a real file explorer's background is.
  await page.getByRole('tree', { name: 'Files' }).click({ button: 'right', position: { x: 10, y: 300 } });
  await expect(page.getByRole('menuitem', { name: 'New File' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'New Folder' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
});

test('New File creates an inline row, pre-filled and selected, that becomes a real entry on Enter', async ({
  page,
}) => {
  await openFiles(page);

  await page.getByRole('tree', { name: 'Files' }).click({ button: 'right', position: { x: 10, y: 300 } });
  await page.getByRole('menuitem', { name: 'New File' }).click();

  const input = page.getByTestId('inline-name-input');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('Untitled');
  await expect(input).toBeFocused();
  if (process.env.MSTUDIO_SHOTS) {
    await page.screenshot({ path: '../../docs/screenshots/phase-24-c/inline-create.png' });
  }

  await input.fill('notes.md');
  await input.press('Enter');

  // Created, selected and opened in the preview immediately.
  await expect(page.getByRole('treeitem', { name: /^notes\.md$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
});

test('creating a name that collides with a sibling shows an inline error and does not create it', async ({
  page,
}) => {
  await openFiles(page);

  await page.getByRole('tree', { name: 'Files' }).click({ button: 'right', position: { x: 10, y: 300 } });
  await page.getByRole('menuitem', { name: 'New File' }).click();

  const input = page.getByTestId('inline-name-input');
  await input.fill('README.md');
  await expect(page.getByText('Already exists here')).toBeVisible();

  await input.press('Enter');
  // Refused rather than round-tripped: still exactly one README.md row.
  await expect(page.getByRole('treeitem', { name: /^README\.md$/ })).toHaveCount(1);
});

test('New Folder on a collapsed directory auto-expands it to show the inline row', async ({ page }) => {
  await openFiles(page);

  const src = page.getByRole('treeitem', { name: /^src$/ });
  await src.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New Folder' }).click();

  // `src` auto-expanded: its existing child is now visible alongside the new inline row.
  await expect(page.getByRole('treeitem', { name: /main\.ts/ })).toBeVisible();
  const input = page.getByTestId('inline-name-input');
  await expect(input).toHaveValue('New Folder');

  await input.press('Enter');
  await expect(page.getByRole('treeitem', { name: /^New Folder$/ })).toBeVisible();
});

test('Rename swaps the row for an inline input and commits on Enter', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /README\.md/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();

  const input = page.getByTestId('inline-name-input');
  await expect(input).toHaveValue('README.md');
  await expect(input).toBeFocused();

  await input.fill('GUIDE.md');
  await input.press('Enter');

  await expect(page.getByRole('treeitem', { name: /^GUIDE\.md$/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /^README\.md$/ })).toHaveCount(0);
});

test('Escape reverts a rename in progress, unchanged', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /README\.md/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByTestId('inline-name-input').fill('whatever');
  await page.keyboard.press('Escape');

  await expect(page.getByRole('treeitem', { name: /^README\.md$/ })).toBeVisible();
});

test('deleting a file shows the uncommitted warning and removes the row on confirm', async ({
  page,
}) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /README\.md/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Delete "README.md"?');
  // A file's blast radius is a `warnings` line, not the commit-shaped
  // `blastRadius` field — the dialog must not read the latter's `undefined`
  // as "still being counted" and stick on this line forever.
  await expect(dialog.getByText('Checking what this affects…')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByRole('treeitem', { name: /^README\.md$/ })).toHaveCount(0);
});

test('deleting a directory counts its contents before showing the confirm', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /^src$/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // `src` holds one 64-byte file — the dirStats walk over the mock's own fsDirs.
  await expect(dialog).toContainText('1 file, 64 B');
  await expect(dialog.getByText('Checking what this affects…')).toHaveCount(0);
  if (process.env.MSTUDIO_SHOTS) {
    await page.screenshot({ path: '../../docs/screenshots/phase-24-c/delete-confirm.png' });
  }
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByRole('treeitem', { name: /^src$/ })).toHaveCount(0);
});

test('Reveal in Finder and Copy Relative Path record the row they were called on', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /README\.md/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Reveal in Finder' }).click();
  expect(
    await page.evaluate(() => (window as never as { __mstudioRevealedPaths: string[] }).__mstudioRevealedPaths),
  ).toEqual(['README.md']);

  await page.getByRole('treeitem', { name: /README\.md/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy Relative Path' }).click();
  expect(
    await page.evaluate(() => (window as never as { __mstudioClipboard: string[] }).__mstudioClipboard),
  ).toEqual(['README.md']);
});

test('the hover ellipsis opens the same menu as right-click', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /README\.md/ }).hover();
  await page.getByRole('button', { name: 'Actions for README.md' }).click();
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
});

test("the Agent settings page's claude-home tree offers no context menu at all", async ({ page }) => {
  await installMockBridge(page, {
    ...fixtures,
    fsDirs: {
      'claude:': [{ name: 'CLAUDE.md', kind: 'file', size: 10, isIgnored: false }],
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const nav = page.getByRole('navigation', { name: 'Settings pages' });
  await expect(nav).toBeVisible();
  // Scoped: an unscoped 'Agent' collides with the persistent rail's 'Agents'
  // section header and its collapsed 'Agent loop launchers' toggle, both of
  // which stay mounted behind the settings page.
  await nav.getByRole('button', { name: 'Agent' }).click();

  const row = page.getByRole('treeitem', { name: /CLAUDE\.md/ });
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });
  // Read-only by construction: `writable` defaults false, so this tree never
  // wires a context menu at all — nothing should appear, ever.
  await expect(page.getByRole('menu')).toHaveCount(0);
});
