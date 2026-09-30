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
 * The standalone Changes view removed (ad hoc) — shots, light and dark: the
 * brand-gradient Commit button at rest, hovered (its blurred-gradient glow)
 * and disabled (nothing staged), and the rail without a Changes row.
 *
 * Needs a real browser for real CSS: the gradient fill, the blurred glow and
 * the rail's layout are paint. Reduced motion so the glow's fade is settled.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-drop-changes';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const entry = (path: string, staged: string, unstaged: string) => ({
  path,
  origPath: null,
  staged,
  unstaged,
  conflicted: false,
  similarity: null,
});

const STAGED: MockFixtures = {
  ...fixtures,
  statusEntries: [
    entry('packages/desktop/src/main/window.ts', 'modified', 'unmodified'),
    entry('packages/app/src/styles.css', 'modified', 'unmodified'),
    entry('README.md', 'unmodified', 'modified'),
  ],
};

const NOTHING_STAGED: MockFixtures = {
  ...fixtures,
  statusEntries: [entry('README.md', 'unmodified', 'modified')],
};

const SUBJECT = 'feat(phase-11): package, install and run from /Applications';

async function open(page: Page, theme: 'light' | 'dark', data: MockFixtures) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockBridge(page, data);
  await page.goto('/');
  await setTheme(page, theme);
  await setReducedMotion(page);
  await expect(page.getByText(SUBJECT).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
}

async function commitButton(page: Page) {
  await page.getByTestId('uncommitted-row').click();
  await page.getByPlaceholder('Commit message').filter({ visible: true }).fill('chore: drop the Changes view');
  const button = page.getByTestId('commit-button').filter({ visible: true });
  await expect(button).toBeVisible();
  await page.mouse.move(1400, 880);
  await page.waitForTimeout(300);
  return button;
}

/** The commit box — the button plus room for its glow. */
const boxShot = (page: Page, name: string) =>
  page
    .getByPlaceholder('Commit message')
    .filter({ visible: true })
    .locator('xpath=ancestor::div[2]')
    .screenshot({ path: shotPath(OUT, name) });

for (const theme of ['light', 'dark'] as const) {
  test(`commit button at rest and hovered, ${theme}`, async ({ page }) => {
    await open(page, theme, STAGED);
    const button = await commitButton(page);
    await boxShot(page, `commit-rest-${theme}`);
    await button.hover();
    await page.waitForTimeout(300);
    await boxShot(page, `commit-hover-${theme}`);
  });

  test(`commit button disabled, ${theme}`, async ({ page }) => {
    await open(page, theme, NOTHING_STAGED);
    const button = await commitButton(page);
    await expect(button).toBeDisabled();
    await button.hover();
    await page.waitForTimeout(300);
    await boxShot(page, `commit-disabled-${theme}`);
  });

  test(`rail without Changes, ${theme}`, async ({ page }) => {
    await open(page, theme, STAGED);
    const rail = page.getByRole('complementary', { name: 'Views' });
    await rail.hover();
    await page.waitForTimeout(400);
    await rail.screenshot({ path: shotPath(OUT, `rail-${theme}`) });
  });
}
