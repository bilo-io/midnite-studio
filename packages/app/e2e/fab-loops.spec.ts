import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The FAB loop console (Phase 35).
 *
 * Two of these assertions are the bug this phase exists to fix, stated in the
 * terms it actually broke in: the ad-hoc panel spawned a session per tab *on
 * mount* and piled all four into the main terminal housing, then latched every
 * tab onto whichever session happened to be last in a pre-call closure
 * snapshot. So the spec asserts "nothing is created until Start" and "what
 * Start creates never appears in the main session list" rather than
 * screenshotting a panel and hoping.
 */

const rows = (page: Page) => page.locator('[data-session-row]');
const panel = (page: Page) => page.locator('[data-terminal-panel]');

async function open(page: Page, over: Partial<MockFixtures> = {}): Promise<void> {
  await installMockBridge(page, { ...fixtures, ...over } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/**
 * Open the FAB panel and let its reveal tween settle — the panel slides in
 * over `REVEAL_MS`, and a click landing mid-slide is rejected as "not stable".
 */
async function openFab(page: Page, tab?: string): Promise<void> {
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await expect(page.getByRole('button', { name: 'Innovate', exact: true })).toBeVisible();
  if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
  await page.waitForTimeout(SETTLE_WAIT_MS);
}

/** The reveal tween's own duration (`REVEAL_MS` in `use-reveal.ts`), plus slack. */
const SETTLE_WAIT_MS = 300;

/** What the app asked the (fake) main process to record about its runs. */
const loopRuns = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __mstudioLoopRuns: () => Array<Record<string, unknown>> }
    ).__mstudioLoopRuns(),
  );

/** Say that main's activity detector changed its guess for the newest pty. */
async function emitActivity(
  page: Page,
  activity: 'thinking' | 'waiting' | 'idle' | null,
  ptyId: string,
): Promise<void> {
  const delivered = await page.evaluate(
    ({ id, act }) =>
      (
        window as unknown as {
          __mstudioPtyActivity: (p: string, a: typeof act) => boolean;
        }
      ).__mstudioPtyActivity(id, act),
    { id: ptyId, act: activity },
  );
  expect(delivered, `pty:activity was not delivered to ${ptyId}`).toBe(true);
}

test.describe('FAB loop console', () => {
  test('renders the four loops from the registry, with no session spawned on mount', async ({
    page,
  }) => {
    await open(page);
    await openFab(page);

    for (const label of ['Innovate', 'Automate', 'Watchdog', 'Medic']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    // The eager-spawn bug: four panes used to appear before anything was pressed.
    await expect(page.locator('.xterm-screen')).toHaveCount(0);
    expect(await loopRuns(page)).toEqual([]);
  });

  test('a loop tab offers its declared modifiers and an extras field', async ({ page }) => {
    await open(page);
    await openFab(page, 'Watchdog');

    const composer = page.getByTestId('loop-composer-watchdog');
    await expect(composer.getByLabel('Watch dependabot PRs')).toBeVisible();
    await expect(composer.getByLabel('Triage only')).toBeVisible();
    await expect(composer.getByPlaceholder('Extra instructions…')).toBeVisible();
  });

  test('Start composes the prompt from the checked modifiers and the extras', async ({ page }) => {
    await open(page);
    await openFab(page, 'Watchdog');

    const composer = page.getByTestId('loop-composer-watchdog');
    await composer.getByLabel('Watch dependabot PRs').check();
    await composer.getByPlaceholder('Extra instructions…').fill('Skip drafts.');
    await composer.getByTestId('loop-start').click();

    await expect.poll(async () => (await loopRuns(page)).length).toBe(1);
    const [run] = await loopRuns(page);
    expect(run?.['loopId']).toBe('watchdog');
    expect(run?.['composedPrompt']).toBe(
      '/loop /midnite-address-issue Also watch for dependabot PRs and handle them. Skip drafts.',
    );
    // Only the checked one — the unchecked "Triage only" fragment must not ride along.
    expect(run?.['checkedModifierIds']).toEqual(['dependabot']);
  });

  test('the loop session never appears in the main terminal housing', async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();

    // The FAB's own pane has a terminal…
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    /*
      …and the main panel, opened afterwards, does not list or render it. The
      assertion is about the LOOP's row specifically, not the row count: the
      panel auto-opens a shell of its own when it comes up to an empty list,
      so counting rows would race that effect rather than state the intent.
    */
    await page.keyboard.press('Control+`');
    await expect(panel(page)).toBeVisible();
    await expect(rows(page).filter({ hasText: 'Innovate' })).toHaveCount(0);
    // Whatever the panel opened for itself, the FAB's pane still has its own.
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();
  });

  test('starting a loop does not open the main terminal panel', async ({ page }) => {
    await open(page);
    await openFab(page, 'Automate');
    await page.getByTestId('loop-composer-automate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-automate').getByTestId('loop-stop')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });

  test('Start swaps to a glowing Stop, and the composer collapses to chips', async ({ page }) => {
    await open(page);
    await openFab(page, 'Medic');

    const composer = page.getByTestId('loop-composer-medic');
    await composer.getByLabel('Auto-approve passing PRs').check();
    await composer.getByTestId('loop-start').click();

    const stop = composer.getByTestId('loop-stop');
    await expect(stop).toBeVisible();
    await expect(stop).toHaveClass(/loop-run-glow/);
    // Collapsed: the inputs are gone, the checked modifier survives as a chip.
    await expect(composer.getByPlaceholder('Extra instructions…')).toHaveCount(0);
    await expect(composer.getByText('Auto-approve passing PRs')).toBeVisible();
  });

  test('a waiting loop turns its tab dot and the FAB dot amber', async ({ page }) => {
    await open(page);
    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();

    await expect(page.getByTestId('loop-dot-innovate')).toHaveClass(/text-blue-500/);
    await emitActivity(page, 'waiting', 'pty-1');
    await expect(page.getByTestId('loop-dot-innovate')).toHaveClass(/bg-amber-500/);
    await expect(page.getByTestId('fab-loop-dot-innovate')).toHaveClass(/bg-amber-500/);
  });

  test('the collapsed FAB shows a dot per live loop and none when idle', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('fab-loop-dots')).toHaveCount(0);

    await openFab(page);
    await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
    await page.getByRole('button', { name: 'Automate', exact: true }).click();
    await page.waitForTimeout(SETTLE_WAIT_MS);
    await page.getByTestId('loop-composer-automate').getByTestId('loop-start').click();

    await expect(page.getByTestId('fab-loop-dot-innovate')).toBeVisible();
    await expect(page.getByTestId('fab-loop-dot-automate')).toBeVisible();
    await expect(page.getByTestId('fab-loop-dot-watchdog')).toHaveCount(0);
  });

  test('Stop finalises the run and the history records what it carried', async ({ page }) => {
    await open(page);
    await openFab(page);
    const composer = page.getByTestId('loop-composer-innovate');
    await composer.getByLabel('Prefer small phases').check();
    await composer.getByTestId('loop-start').click();
    await composer.getByTestId('loop-stop').click();

    await expect.poll(async () => (await loopRuns(page))[0]?.['status']).toBe('stopped');

    const history = page.getByTestId('loop-history').first();
    await expect(history.getByRole('button', { name: /History \(1\)/ })).toBeVisible();
    await history.getByRole('button', { name: /History \(1\)/ }).click();
    await expect(history.getByText('stopped')).toBeVisible();
  });
});
