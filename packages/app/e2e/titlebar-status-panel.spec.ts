import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The titlebar status panel's Time/Date tabs — Time holds the clock and
 * world clock, Date holds the calendar and weather. The two tabs, the
 * settings gear and the close button all live on the panel's header row.
 */
test.describe('titlebar status panel tabs', () => {
  test('defaults to Time, and switching to Date swaps the sections', async ({ page }) => {
    await installMockBridge(page, { ...fixtures });
    await page.goto('/');

    await page.getByTestId('titlebar-status-pill').click();
    const panel = page.getByTestId('titlebar-status-panel');
    await expect(panel).toBeVisible();

    const timeTab = panel.getByTestId('titlebar-status-tab-time');
    const dateTab = panel.getByTestId('titlebar-status-tab-date');
    await expect(timeTab).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByText('Current Time')).toBeVisible();
    await expect(panel.getByText('World Clocks')).toBeVisible();
    await expect(panel.getByText('Calendar')).toHaveCount(0);

    await dateTab.click();
    await expect(dateTab).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByText('Calendar')).toBeVisible();
    await expect(panel.getByText('World Clocks')).toHaveCount(0);
  });

  test('the settings drawer scopes to the active tab', async ({ page }) => {
    await installMockBridge(page, { ...fixtures });
    await page.goto('/');

    await page.getByTestId('titlebar-status-pill').click();
    const panel = page.getByTestId('titlebar-status-panel');
    await panel.getByTitle('Configure status bar display & sections').click();
    const drawer = panel.getByTestId('titlebar-status-config-drawer');

    // Time tab is active by default — its drawer offers Time-only controls.
    await expect(drawer.getByText('Current Time', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Calendar', { exact: true })).toHaveCount(0);

    await panel.getByTestId('titlebar-status-tab-date').click();
    await expect(drawer.getByText('Calendar', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Current Time', { exact: true })).toHaveCount(0);
  });
});
