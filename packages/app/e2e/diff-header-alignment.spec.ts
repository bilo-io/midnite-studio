import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures, installMockBridge, type MockFixtures } from './shots-helper';

/**
 * Side-by-side header bars in the graph's inline diff views line up across the
 * divider. Needs a real browser: the assertion is `getBoundingClientRect`
 * (top / height / bottom) of rows in two columns, which jsdom has no layout
 * for. Covers the working-copy panel (left totals bar vs right files bar) and
 * the commit diff's split layout (left commit header vs right files bar).
 */
const entry = (path: string, staged: string, unstaged: string) => ({
  path,
  origPath: null,
  staged,
  unstaged,
  conflicted: false,
  similarity: null,
});

const DATA: MockFixtures = {
  ...fixtures,
  statusEntries: [
    entry('src/staged.ts', 'modified', 'unmodified'),
    entry('README.md', 'unmodified', 'modified'),
  ],
  statusCounts: {
    'staged:src/staged.ts': { insertions: 4, deletions: 1 },
    'unstaged:README.md': { insertions: 3, deletions: 1 },
  },
};

const SUBJECT = 'feat(phase-11): package, install and run from /Applications';

async function rect(loc: Locator) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height, bottom: r.bottom };
  });
}

async function expectAligned(left: Locator, right: Locator) {
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  const [l, r] = [await rect(left), await rect(right)];
  expect(Math.abs(l.top - r.top)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(l.height - r.height)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(l.bottom - r.bottom)).toBeLessThanOrEqual(0.5);
}

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(page.getByText(SUBJECT).first()).toBeVisible({ timeout: 30_000 });
}

test('working-copy panel: left totals bar and right files bar share top, height and bottom', async ({ page }) => {
  await open(page);
  await page.getByTestId('uncommitted-row').click();
  const panel = page.getByTestId('working-tree-inline-panel').filter({ visible: true });
  await panel.getByRole('button', { name: 'View all changes' }).click();
  const left = panel.locator('xpath=.//button[@aria-label="View all changes"]/..');
  const right = panel.getByRole('button', { name: 'Collapse all files' }).locator('xpath=..');
  await expectAligned(left, right);
});

test('commit diff split layout: left commit header and right files bar stay aligned', async ({ page }) => {
  await open(page);
  await page.getByText(SUBJECT).first().click();
  const left = page.getByTestId('commit-header-bar').filter({ visible: true });
  const right = page.getByRole('button', { name: 'Collapse all files' }).filter({ visible: true }).locator('xpath=..');
  await expectAligned(left, right);
});
