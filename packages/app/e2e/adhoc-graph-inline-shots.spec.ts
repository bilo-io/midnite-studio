import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  setReducedMotion,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * The Diff view folded into the git graph (ad hoc) — before/after shots,
 * light and dark: the graph collapsed, a commit expanded with a file picked,
 * and the working copy expanded with a message typed (the gradient Commit
 * button, at rest and hovered). Run once against `main` with
 * `MSTUDIO_SHOT_VARIANT=before` — where a commit opens the right-hand aside
 * and the working-copy row opens the separate Changes view — and once on the
 * branch.
 *
 * Needs a real browser for real CSS: the panel card, the lanes under it and
 * the gradient button's border and halo are paint. Reduced motion, so the
 * panel is already settled and the halo holds its static frame.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-graph-inline';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

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
    entry('packages/desktop/src/main/window.ts', 'modified', 'unmodified'),
    entry('.midnite/api/environments/demo.json', 'unmodified', 'untracked'),
    entry('README.md', 'unmodified', 'modified'),
  ],
  statusCounts: {
    'staged:packages/desktop/src/main/window.ts': { insertions: 4, deletions: 1 },
    'unstaged:.midnite/api/environments/demo.json': { insertions: 49, deletions: 0 },
    'unstaged:README.md': { insertions: 3, deletions: 1 },
  },
};

const SUBJECT = 'feat(phase-11): package, install and run from /Applications';

async function open(page: Page, theme: 'light' | 'dark') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockBridge(page, DATA);
  await page.goto('/');
  await setTheme(page, theme);
  await setReducedMotion(page);
  await expect(page.getByText(SUBJECT).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: shotPath(OUT, `${name}-${VARIANT}`) });

for (const theme of ['light', 'dark'] as const) {
  test(`graph collapsed, ${theme}`, async ({ page }) => {
    await open(page, theme);
    await shot(page, `collapsed-${theme}`);
  });

  test(`commit expanded with a file selected, ${theme}`, async ({ page }) => {
    await open(page, theme);
    await page.getByText(SUBJECT).first().click();
    await page
      .getByTestId('commit-files')
      .filter({ visible: true })
      .getByRole('button', { name: /window\.ts/ })
      .click();
    await expect(page.getByTestId('diff-view').first()).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, `commit-expanded-${theme}`);
  });

  test(`working copy expanded, ${theme}`, async ({ page }) => {
    await open(page, theme);
    await page.getByRole('button', { name: /^3 uncommitted changes/ }).click();
    const box = page.getByPlaceholder('Commit message').filter({ visible: true });
    await box.fill('chore: fold the Diff view into the graph');
    const commit = page.getByRole('button', { name: /^Commit 1 file/ }).filter({ visible: true });
    await expect(commit).toBeVisible();
    await page.mouse.move(1400, 880);
    await page.waitForTimeout(400);
    await shot(page, `working-copy-${theme}`);

    await commit.hover();
    await page.waitForTimeout(300);
    await commit.locator('xpath=..').screenshot({ path: shotPath(OUT, `commit-button-hover-${theme}-${VARIANT}`) });
  });
}
