import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Files view learns to write (Phase 24 Theme C): a context menu on every
 * row, inline create/rename, and delete behind a blast-radius confirm. Every
 * write here mutates the mock bridge's own `fsDirs`/`fsFiles` fixtures rather
 * than returning a fixed `{ok:true}` — per Phase 20's rule, a write that
 * changed nothing must not pass.
 *
 * All 12 of this spec's original tests moved to
 * `file-tree.bridge.test.tsx` under jsdom (Phase 82 Theme C, wave 1) — see
 * the phase 82 PR body for the removed-test → replacement-test mapping. One
 * stays here, the fullest interaction chain (rail navigation → context menu
 * → inline create → commit → real entry, selected and opened in the
 * preview), as the smoke test proving the assembled app still wires the
 * rail, the tree and the write path together against a real browser.
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
