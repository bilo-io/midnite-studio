import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The landing page, in the running app.
 *
 * The unit tests own the carousel's machinery (phases, wraparound, autoplay)
 * and the cheat sheet's fidelity to `COMMANDS`. What only the app can show is
 * the part that made this a feature rather than a component: that the brand
 * mark actually goes there from wherever you are, that the page renders in
 * the content box with the app's chrome intact, and that the FAB console's
 * rotating gradient is on it.
 */

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/** The rail's brand, which is the only home link visible in a framed window. */
function homeLink(page: Page) {
  return page.getByRole('button', { name: 'Go to the landing page' }).first();
}

test('the brand mark navigates to the landing page', async ({ page }) => {
  await open(page);
  await homeLink(page).click();

  const view = page.getByTestId('landing-view');
  await expect(view).toBeVisible();
  // The FAB console's own rotating rainbow, shared rather than reimplemented.
  await expect(view).toHaveClass(/landing-panel-gradient/);
});

test('it keeps the lock screen frame around a four-slide carousel', async ({ page }) => {
  await open(page);
  await homeLink(page).click();

  await expect(page.getByTestId('lock-screen-widgets')).toBeVisible();
  await expect(page.getByText('Local Time')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(4);
  await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
});

test('a dot moves the middle and leaves the frame alone', async ({ page }) => {
  await open(page);
  await homeLink(page).click();

  await page.getByTestId('landing-dot-1').click();
  await expect(page.getByTestId('landing-dot-1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Getting around')).toBeVisible();
  // The clock and the widgets are outside the animating stage.
  await expect(page.getByTestId('lock-screen-widgets')).toBeVisible();

  await page.getByTestId('landing-dot-3').click();
  await expect(page.getByText('The loop console')).toBeVisible();
  // All four loop tabs, in their own colours.
  for (const id of ['innovate', 'automate', 'watchdog', 'medic']) {
    await expect(page.getByTestId(`landing-loop-${id}`)).toBeVisible();
  }
});

test('the arrow keys wrap around the carousel', async ({ page }) => {
  await open(page);
  await homeLink(page).click();

  /*
    Click the dot that is already selected first. It moves nothing (`goTo`
    returns early on the current index) and retires autoplay, which otherwise
    advances the page out from under the assertions below on a slow runner —
    this spec is about the wrap, not about the timer.
  */
  await page.getByTestId('landing-dot-0').click();
  await expect(page.getByTestId('landing-dot-0')).toHaveAttribute('aria-selected', 'true');

  // Left from the first slide lands on the last.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('landing-dot-3')).toHaveAttribute('aria-selected', 'true');
  // And right from the last comes back to the first.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('landing-dot-0')).toHaveAttribute('aria-selected', 'true');
});

test('it is a view, not an overlay — the rail navigates away from it', async ({ page }) => {
  await open(page);
  await homeLink(page).click();
  await expect(page.getByTestId('landing-view')).toBeVisible();

  /*
    Hover before clicking: the rail is collapsed by default and hover-expands
    as an overlay, so a cold click can land on the icon strip rather than the
    link. The same two-step is already how `review-threads-shots.spec.ts`
    reaches a rail item.
  */
  const graph = page.getByRole('link', { name: 'Graph' });
  await graph.hover();
  await graph.click();
  await expect(page.getByTestId('landing-view')).toBeHidden();
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
});
