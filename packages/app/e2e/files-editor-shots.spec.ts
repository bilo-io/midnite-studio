import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';
import { fixtures, REPRODUCIBLE_REMOTE, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * The Monaco editor in the Files view (Phase 64 Themes A/C) — before/after
 * this phase, the same shot would have shown CodeMirror. Light + dark, per
 * the phase's build discipline.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays
 * fast, matching every other `*-shots.spec.ts` file's own gate.
 */
const OUT = '../../docs/screenshots/p64-abcd';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const editorFixtures: MockFixtures = {
  ...fixtures,
  remotes: [REPRODUCIBLE_REMOTE],
  fsDirs: {
    'repo:': [{ name: 'greeter.ts', kind: 'file', size: 120, isIgnored: false }],
  },
  fsFiles: {
    'repo:greeter.ts': {
      kind: 'text',
      content: [
        "import type { Greeting } from './types';",
        '',
        '/** Says hello, Monaco-highlighted. */',
        'export function greet(name: string): Greeting {',
        '  return { text: `Hello, ${name}!`, at: Date.now() };',
        '}',
        '',
      ].join('\n'),
      size: 180,
      version: { mtimeMs: 1, size: 180 },
    },
  },
};

async function openEditor(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await installMockBridge(page, editorFixtures);
  await page.goto('/');
  if (mode === 'dark') await setTheme(page, 'dark');
  await setReducedMotion(page);
  await clickRailLink(page, 'Explorer');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
  await page.getByRole('treeitem', { name: /^greeter\.ts$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('export function greet');
  // Let Monaco finish laying out and tokenizing before the shot.
  await page.waitForTimeout(400);
}

for (const mode of ['light', 'dark'] as const) {
  test(`the Monaco editor in the Files view (${mode})`, async ({ page }) => {
    await openEditor(page, mode);
    await page.screenshot({ path: shotPath(OUT, `code-editor-${mode}.png`) });
  });
}
