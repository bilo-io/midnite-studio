import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, prepareForVisualCapture } from '../shots-helper';

/**
 * Phase 86 Theme G/H — the Notes page's content pane, in both the states its
 * own toggle switches between: Monaco (lazy-loaded, per Theme G) and the
 * markdown preview. `notes-view.test.tsx` already proves the toggle flips
 * `showPreview` and which component renders; this crop is the one place that
 * proves Monaco itself actually painted real content, not a mocked stand-in.
 */
async function openNoteInEditor(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Notes');

  const composer = page.getByTestId('notes-composer');
  await composer.fill('## Ship the write queue fix\n\nSerialise per repo, not per worktree.');
  await composer.press('Enter');

  // The composer auto-selects the just-created note into the content pane in
  // editor mode (`notes-view.tsx`'s `handleComposerKeyDown`), so Monaco's lazy
  // chunk is already loading by the time this resolves.
  await expect(page.getByTestId('notes-content-pane').locator('.monaco-editor .view-lines')).toContainText(
    'Ship the write queue fix',
  );
}

test('the Notes content pane, editing in Monaco', async ({ page }) => {
  await openNoteInEditor(page);
  await prepareForVisualCapture(page);

  await expect(page.getByTestId('notes-content-pane')).toHaveScreenshot('notes-content-pane-edit.png');
});

test('the Notes content pane, markdown preview', async ({ page }) => {
  await openNoteInEditor(page);

  await page.getByRole('button', { name: 'Show preview' }).click();
  await expect(
    page.getByTestId('notes-content-pane').getByRole('heading', { name: 'Ship the write queue fix' }),
  ).toBeVisible();
  await prepareForVisualCapture(page);

  await expect(page.getByTestId('notes-content-pane')).toHaveScreenshot('notes-content-pane-preview.png');
});
