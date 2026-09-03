import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Phase 43 (Workflows) screenshots.
 *
 * Not assertions — `workflows.spec.ts` owns those. These exist to produce the
 * PNGs the PR embeds. The canvas shot is seeded directly through the mock's
 * `appWorkflows` fixture rather than driven through the toolbar, so node
 * positions are deterministic and the picture is reproducible.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching `dashboard-shots.spec.ts`.
 */
const OUT = '../../docs/screenshots/phase-43-workflows';

const NOW = Date.now();

const SEEDED_WORKFLOW = {
  id: 'wf-seeded',
  name: 'Fetch, transform, notify',
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
      x: 280,
      y: 40,
      config: { left: '{{n1.body.status}}', op: 'eq', right: 'active' },
    },
    {
      id: 'n3',
      label: 'Shape row',
      kind: 'transform',
      x: 280,
      y: 280,
      config: { picks: [{ from: 'n1.body.name', to: 'name' }] },
    },
    {
      id: 'n4',
      label: 'Note',
      kind: 'note',
      x: 560,
      y: 160,
      config: { text: 'Wire the Slack node here once it exists.' },
    },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n1', to: 'n3' },
    { id: 'e3', from: 'n2', to: 'n4' },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

const shots: MockFixtures = { ...fixtures, appWorkflows: [SEEDED_WORKFLOW] };

/** The canvas measures its container on mount; give the resize a tick to settle. */
const SETTLE_MS = 300;

async function openWorkflows(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  // Same pre-existing first-nav-click flakiness `workflows.spec.ts`'s `open()`
  // documents (reproduces identically on this link) — retry rather than chase
  // the race here.
  await expect(async () => {
    await page.getByRole('link', { name: 'Workflows', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New workflow' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });

  await page.waitForTimeout(SETTLE_MS);
}

test.describe('workflows screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('the empty list', async ({ page }) => {
    await openWorkflows(page, { ...fixtures, appWorkflows: [] });
    await page.getByText('No workflows yet').waitFor();
    await page.screenshot({ path: `${OUT}/workflows-empty.png` });
  });

  test('a workflow with connected nodes on the canvas', async ({ page }) => {
    await openWorkflows(page, shots);
    await page.getByText('Fetch, transform, notify').first().click();
    await page.locator('[data-edge-id]').first().waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/workflows-canvas.png` });
  });

  test('a selected node', async ({ page }) => {
    await openWorkflows(page, shots);
    await page.getByText('Fetch, transform, notify').first().click();
    await page.locator('[data-node-id="n1"]').waitFor();
    await page.locator('[data-node-id="n1"]').click();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/workflows-node-selected.png` });
  });
});
