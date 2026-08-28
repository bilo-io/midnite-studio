import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The committed screenshots for Phase 29 (Themes A-D): the Files-preview
 * trigger, a mid-presentation slide with a highlighted code fence, and the
 * help overlay — each in both themes, following `actions-shots.spec.ts`.
 */

const OUT = '../../docs/screenshots/phase-29-slides';

const README = [
  '# Midnite Slides',
  '',
  'A short deck to present.',
  '',
  '## Code, highlighted',
  '',
  'Fences render through the app\'s own shiki instance.',
  '',
  '```ts',
  'export function greet(name: string): string {',
  '  return `Hello, ${name}!`;',
  '}',
  '```',
].join('\n');

const data: MockFixtures = {
  ...fixtures,
  fsDirs: { 'repo:': [{ name: 'README.md', kind: 'file', size: README.length, isIgnored: false }] },
  fsFiles: { 'repo:README.md': { kind: 'text', content: README, size: README.length } },
};

async function openFile(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await page.getByRole('link', { name: 'Files' }).click();
  await page.getByRole('treeitem', { name: /README\.md/ }).click();
  await expect(page.getByText('A short deck to present.')).toBeVisible();
}

async function dark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
}

test('light: the Present trigger in the Files preview header', async ({ page }) => {
  await openFile(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/trigger-light.png` });
});

test('dark: the Present trigger in the Files preview header', async ({ page }) => {
  await dark(page);
  await openFile(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/trigger-dark.png` });
});

async function midPresentation(page: Page): Promise<void> {
  await openFile(page);
  await page.getByRole('button', { name: 'Present as slides' }).click();
  const deck = page.getByTestId('slides-deck');
  await expect(deck).toBeVisible();
  await page.keyboard.press('End'); // the code-fence slide, fully revealed
  await expect(deck.getByText('greet')).toBeVisible();
  await page.waitForTimeout(400); // shiki highlight + title settle
}

test('light: a mid-presentation slide with a highlighted code fence', async ({ page }) => {
  await midPresentation(page);
  await page.screenshot({ path: `${OUT}/mid-presentation-light.png` });
});

test('dark: a mid-presentation slide with a highlighted code fence', async ({ page }) => {
  await dark(page);
  await midPresentation(page);
  await page.screenshot({ path: `${OUT}/mid-presentation-dark.png` });
});

async function help(page: Page): Promise<void> {
  await openFile(page);
  await page.getByRole('button', { name: 'Present as slides' }).click();
  await expect(page.getByTestId('slides-deck')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Presentation shortcuts' })).toBeVisible();
}

test('light: the help overlay', async ({ page }) => {
  await help(page);
  await page.screenshot({ path: `${OUT}/help-overlay-light.png` });
});

test('dark: the help overlay', async ({ page }) => {
  await dark(page);
  await help(page);
  await page.screenshot({ path: `${OUT}/help-overlay-dark.png` });
});
