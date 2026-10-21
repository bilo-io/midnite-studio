import { expect, test } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_NOW_MS,
  setTheme,
  settle,
  SHOT_VIEWPORTS,
  shotPath,
} from './shots-helper';

/**
 * Graphs view label screenshots for the PR (list header, filter placeholder, empty state).
 * Not assertions. Needs a real browser only to render the PNG. Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/adhoc-graphs-view-labels';

const graph = (id: string, name: string) => ({
  id,
  name,
  nodes: [
    {
      id: 'n1',
      label: 'Fetch users',
      kind: 'http',
      x: 40,
      y: 120,
      config: { method: 'GET', url: 'https://api.example.com/users', headers: {}, params: {}, queryShaped: false },
    },
  ],
  edges: [],
  createdAt: REPRODUCIBLE_NOW_MS,
  updatedAt: REPRODUCIBLE_NOW_MS,
});

const data: MockFixtures = {
  ...fixtures,
  appWorkflows: [graph('g1', 'Fetch and shape'), graph('g2', 'Nightly digest')],
};

test.describe('graphs view label screenshots', () => {
  test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('list header and empty state, then the focused filter', async ({ page }) => {
    test.setTimeout(120_000);
    await installMockBridge(page, data);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Graphs', exact: true })).toBeVisible({ timeout: 120_000 });
    await setTheme(page, 'dark');

    await clickRailLink(page, 'Graphs');
    await expect(page.getByText('Select a graph')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Graphs' })).toBeVisible();
    await page.mouse.move(900, 500);
    await settle(page, 800);
    await page.screenshot({ path: shotPath(OUT, 'graphs-list-empty-state.png') });

    const filter = page.getByPlaceholder('Filter graphs…');
    await filter.focus();
    await filter.fill('fetch');
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'graphs-filter-focused.png') });
  });
});
