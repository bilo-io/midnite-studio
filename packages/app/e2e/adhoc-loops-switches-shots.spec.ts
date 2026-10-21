import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures, installMockBridge, type MockFixtures, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * PR-body screenshots for the Loops form's switch rows: every option a switch
 * with a tooltip, a prompt preview behind a chevron, a skill field while on,
 * and the Users filter / auto-rotate slider / Loop switch folded in from #870.
 *
 * Not assertions (`loop-composer.test.tsx` and `fab-loops.spec.ts` carry
 * those). Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/adhoc-loops-switches';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.use({ viewport: { width: 1280, height: 1100 } });

const data = {
  ...fixtures,
  knownSkills: [
    { name: 'pr-review', description: 'Review a pull request against the house rubric', source: 'repo' },
    { name: 'midnite-pr-review', description: 'Midnite review: findings as CRITICAL / WARNING / NIT', source: 'midnite' },
    { name: 'pr-feedback', description: 'Answer review comments and fix CI on your own PRs', source: 'repo' },
    { name: 'review-lite', description: 'A quick pass for small diffs', source: 'user' },
    { name: 'midnite-sitrep', description: 'One-table status of everything in flight', source: 'midnite' },
  ],
  stats: {
    contributors: [
      { name: 'Ada Lovelace', email: '1+ada@users.noreply.github.com', commits: 42, insertions: null, deletions: null, firstAt: 0, lastAt: 0 },
      { name: 'Grace Hopper', email: '2+grace@users.noreply.github.com', commits: 17, insertions: null, deletions: null, firstAt: 0, lastAt: 0 },
      { name: 'Alan Turing', email: 'alan@example.com', commits: 5, insertions: null, deletions: null, firstAt: 0, lastAt: 0 },
    ],
  },
} as MockFixtures;

async function openPatrol(page: Page, theme: 'light' | 'dark'): Promise<Locator> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setTheme(page, theme);
  await setReducedMotion(page);
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await page.keyboard.press('l');
  await page.getByRole('button', { name: 'Patrol', exact: true }).click();
  const composer = page.getByTestId('loop-composer-watchdog');
  await expect(composer).toBeVisible();
  await page.waitForTimeout(400);
  return composer;
}

/** The section a control lives in — the crop for that shot. */
function section(composer: Locator, group: 'tasks' | 'scope' | 'run'): Locator {
  return composer.locator(`[data-loop-group="${group}"]`);
}

/** A crop of the region around a locator, padded so a tooltip above it fits. */
async function shoot(page: Page, target: Locator, file: string, pad = { top: 8, bottom: 8 }): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`no box for ${file}`);
  await page.screenshot({
    path: shotPath(OUT, file),
    clip: {
      x: Math.max(0, box.x - 8),
      y: Math.max(0, box.y - pad.top),
      width: box.width + 16,
      height: box.height + pad.top + pad.bottom,
    },
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`switches, on and off — ${theme}`, async ({ page }) => {
    const composer = await openPatrol(page, theme);
    await composer.getByRole('switch', { name: 'Security review' }).check();
    await shoot(page, composer, `switches-${theme}`);
  });

  test(`a switch's tooltip — ${theme}`, async ({ page }) => {
    const composer = await openPatrol(page, theme);
    await composer.getByRole('switch', { name: 'Reply to PRs' }).hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.waitForTimeout(250);
    await shoot(page, section(composer, 'tasks'), `tooltip-${theme}`, { top: 70, bottom: 8 });
  });

  test(`the prompt preview, expanded — ${theme}`, async ({ page }) => {
    const composer = await openPatrol(page, theme);
    await composer.getByRole('button', { name: 'Show the prompt Routine adds' }).click();
    await composer.getByRole('button', { name: 'Show the prompt Review PRs adds' }).click();
    await page.mouse.move(0, 0);
    await shoot(page, section(composer, 'tasks'), `prompt-preview-${theme}`);
  });

  test(`the skill field, suggesting — ${theme}`, async ({ page }) => {
    const composer = await openPatrol(page, theme);
    const field = composer.getByRole('combobox', { name: 'Skill for Review PRs' });
    await field.click();
    await field.fill('rev');
    await expect(composer.getByRole('listbox', { name: 'Skill for Review PRs suggestions' })).toBeVisible();
    await shoot(page, section(composer, 'tasks'), `skill-combobox-${theme}`);
  });

  test(`Users filter and auto-rotate — ${theme}`, async ({ page }) => {
    const composer = await openPatrol(page, theme);
    const users = composer.getByRole('combobox', { name: 'Review PRs for these users only' });
    await users.click();
    await page.getByRole('option', { name: /Ada Lovelace/ }).click();
    await page.getByRole('option', { name: /Grace Hopper/ }).click();
    await shoot(page, section(composer, 'scope'), `users-menu-${theme}`, { top: 8, bottom: 130 });
    await page.keyboard.press('Escape');
    await composer.getByRole('slider', { name: 'Auto-rotate subagents' }).fill('45');
    await page.mouse.move(0, 0);
    await shoot(page, section(composer, 'scope'), `users-filter-${theme}`);
    await shoot(page, composer.getByTestId('auto-rotate-field'), `auto-rotate-${theme}`);
  });
}
