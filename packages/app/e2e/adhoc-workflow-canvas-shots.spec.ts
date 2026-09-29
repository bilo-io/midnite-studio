import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_NOW_MS,
  settle,
  setTheme,
  SHOT_VIEWPORTS,
  shotPath,
} from './shots-helper';

/**
 * PR-body screenshots for the Workflows canvas styling pass (selected-node
 * outline, edge opacity clamp, collapsible side panels). Not assertions —
 * the vitest suites own those. `MSTUDIO_SHOT_VARIANT=before|after` names the
 * output, so the same spec shoots both sides of the change.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/adhoc-workflow-canvas';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';
const NOW = REPRODUCIBLE_NOW_MS;

/** Every edge kind the canvas draws: data, conditional (both branches), error and loop. */
const WORKFLOW = {
  id: 'wf-styling',
  name: 'Fetch, branch, retry',
  nodes: [
    {
      id: 'n1',
      label: 'Fetch users',
      kind: 'http',
      x: 40,
      y: 160,
      config: { method: 'GET', url: 'https://api.example.com/users', headers: {}, params: {}, queryShaped: false },
    },
    {
      id: 'n2',
      label: 'Only active',
      kind: 'condition',
      x: 320,
      y: 60,
      config: { left: '{{n1.body.status}}', op: 'eq', right: 'active' },
    },
    {
      id: 'n3',
      label: 'Shape row',
      kind: 'transform',
      x: 620,
      y: 0,
      config: { picks: [{ from: 'n1.body.name', to: 'name' }] },
    },
    {
      id: 'n4',
      label: 'Skip row',
      kind: 'transform',
      x: 620,
      y: 150,
      config: { picks: [{ from: 'n1.body.id', to: 'id' }] },
    },
    {
      id: 'n5',
      label: 'Report failure',
      kind: 'transform',
      x: 320,
      y: 300,
      config: { picks: [{ from: 'n1.error', to: 'error' }] },
    },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3', fromPort: 'true', kind: 'conditional' },
    { id: 'e3', from: 'n2', to: 'n4', fromPort: 'false', kind: 'conditional' },
    { id: 'e4', from: 'n1', to: 'n5', fromPort: 'error', kind: 'error' },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

const data: MockFixtures = { ...fixtures, appWorkflows: [WORKFLOW] };

async function open(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await setTheme(page, theme);
  await expect(async () => {
    await page.getByRole('link', { name: 'Workflows', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New workflow' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.getByText('Fetch, branch, retry').first().click();
  await page.locator('.react-flow__edge').first().waitFor({ state: 'attached' });
  await settle(page, 400);
}

test.describe('workflow canvas styling screenshots', () => {
  test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  for (const theme of ['light', 'dark'] as const) {
    test(`edges (${theme})`, async ({ page }) => {
      await open(page, theme);
      await page.getByRole('application', { name: 'Workflow canvas' }).screenshot({
        path: shotPath(OUT, `edges-${theme}-${VARIANT}.png`),
      });
    });

    test(`a selected node (${theme})`, async ({ page }) => {
      await open(page, theme);
      await page.locator('[data-node-id="n2"]').click();
      await settle(page, 400);
      await page.screenshot({ path: shotPath(OUT, `node-selected-${theme}-${VARIANT}.png`) });
    });
  }

  test('both panels open', async ({ page }) => {
    await open(page, 'dark');
    await page.locator('[data-node-id="n2"]').click();
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, `panels-open-${VARIANT}.png`) });
  });

  test('both panels collapsed', async ({ page }) => {
    await open(page, 'dark');
    await page.getByRole('button', { name: 'Hide node palette' }).click();
    const hideInspector = page.getByRole('button', { name: 'Hide inspector' });
    if ((await hideInspector.count()) > 0 && (await hideInspector.isEnabled())) {
      // Nothing is selected, so the inspector has already auto-collapsed —
      // its toggle only shows "Hide" when it is open.
      await hideInspector.click();
    }
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, `panels-collapsed-${VARIANT}.png`) });
  });
});
