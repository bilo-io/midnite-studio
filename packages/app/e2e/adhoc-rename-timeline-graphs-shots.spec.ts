import { expect, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/** Rail rename screenshots (Git Timeline, Agent Graphs) for the PR. Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/adhoc-rename-timeline-graphs';

test.describe('rail rename screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('rail, Timeline page, Graphs page', async ({ page }) => {
    test.setTimeout(120_000);
    await installMockBridge(page, fixtures);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Timeline', exact: true })).toBeVisible({ timeout: 120_000 });

    // Hovering any rail row expands the whole rail.
    const link = page.getByRole('link', { name: 'Timeline', exact: true });
    await link.hover();
    await expect(link.getByText('Timeline', { exact: true })).toBeVisible();
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'rail.png') });

    await clickRailLink(page, 'Timeline');
    await page.mouse.move(900, 500);
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'timeline.png') });

    await clickRailLink(page, 'Graphs');
    await expect(page.getByText('No workflows yet').or(page.getByText('Select a workflow')).first()).toBeVisible({ timeout: 30_000 });
    await page.mouse.move(900, 500);
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'graphs.png') });

    // Command palette listing the Timeline and Graphs rows with their icons.
    await page.keyboard.press('Meta+k');
    await page.keyboard.type('Timeline');
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'palette-timeline.png') });
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('Graphs');
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'palette-graphs.png') });
  });
});
