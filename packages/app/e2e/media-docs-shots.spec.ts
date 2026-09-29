import { expect, test } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  settle,
  SHOT_VIEWPORTS,
  shotPath,
} from './shots-helper';

/**
 * Phase 99 Theme B — Media ▸ Docs PR screenshots (not assertions:
 * `docs-tab.bridge.test.tsx` owns those). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/p99-b';

const DOC = [
  '# Launch plan',
  '',
  'The **Media** page ships in four tabs. Docs are plain markdown in `.midnite/media/doc/`.',
  '',
  '## Checklist',
  '',
  '- [x] Shell and storage',
  '- [ ] Docs editor',
  '- [ ] Images',
  '',
  '## Owners',
  '',
  '| Tab | Owner |',
  '| --- | --- |',
  '| Docs | Bilo |',
  '| Images | Bilo |',
  '',
  '```ts',
  "const tabs = ['doc', 'image', 'video', 'audio'];",
  '```',
  '',
].join('\n');

const DATA: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'doc:handbook': { 'launch-plan.md': DOC, 'onboarding.md': '# Onboarding\n' },
      'doc:roadmap': { 'q4.md': '# Q4\n' },
    },
  },
};

async function openDoc(page: import('@playwright/test').Page): Promise<void> {
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.getByRole('tab', { name: 'Docs' }).click();
  await page.getByText('launch-plan', { exact: true }).click();
  await expect(page.getByTestId('doc-editor')).toBeVisible({ timeout: 10_000 });
}

test.describe('media docs screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.board });

  test('editor with a doc open', async ({ page }) => {
    await openDoc(page);
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'docs-editor.png') });
  });

  test('slash menu', async ({ page }) => {
    await openDoc(page);
    const editor = page.getByTestId('doc-editor');
    await editor.getByText('Shell and storage').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.getByRole('listbox', { name: 'Insert block' })).toBeVisible();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, 'docs-slash-menu.png') });
  });

  test('bubble menu and AI diff card', async ({ page }) => {
    await openDoc(page);
    await page.getByTestId('doc-editor').getByText('The ').dblclick();
    await page.getByTestId('doc-editor').getByText(/The .*Media.* page ships/).click({ clickCount: 3 });
    await expect(page.getByRole('button', { name: 'Ask AI' })).toBeVisible();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, 'docs-bubble-menu.png') });
    await page.getByRole('button', { name: 'Ask AI' }).click();
    await page.getByRole('textbox', { name: 'Ask AI' }).fill('Make this friendlier');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('doc-diff-card')).toBeVisible();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, 'docs-ai-diff.png') });
  });
});
