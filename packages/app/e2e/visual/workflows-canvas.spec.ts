import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  prepareForVisualCapture,
  setTheme,
  SHOT_VIEWPORTS,
  type MockFixtures,
} from '../shots-helper';

/**
 * The workflow canvas's per-kind edge styling (Phase 97 Theme J) — real
 * browser needed: `@xyflow/react` computes every edge path (the smoothstep
 * routing, the loop kind's curved back-edge) from live `getBoundingClientRect`
 * geometry, and the taken/dead/pending paint is real CSS (`stroke`,
 * `stroke-dasharray`, `opacity`) on a real rendered SVG `<path>` — none of
 * which jsdom (`workflow-node-view.test.tsx`, `edge-style.test.ts`) can
 * produce, only assert the inputs to.
 *
 * One workflow, seeded directly through the mock's `appWorkflows` fixture
 * (same technique `workflows-shots.spec.ts` uses) so every node lands at a
 * fixed position and the crop is reproducible, exercises all four
 * `WorkflowEdgeKind`s at once: `data` (n1→n2), `conditional` (n2→n3 on
 * `true`, n2→n4 on `false`), `error` (n1→n5, off the implicit error port)
 * and `loop` (n6→n3, a back-edge). No run is started — every edge reads
 * `pending`, which is the state `data`/`conditional`/`loop`'s own dashed
 * "still live" animation paints (frozen for the capture by
 * `prepareForVisualCapture`'s reduced-motion pass) and is exactly what a
 * kind's base style looks like before a run ever touches it.
 */
const NOW = Date.parse('2026-08-26T12:00:00Z');

const EDGE_KINDS_WORKFLOW = {
  id: 'wf-edge-kinds',
  name: 'Every edge kind',
  nodes: [
    {
      id: 'n1',
      label: 'Fetch users',
      kind: 'http',
      x: 40,
      y: 200,
      config: { method: 'GET', url: 'https://api.example.com/users', headers: {}, params: {}, queryShaped: false },
    },
    {
      id: 'n2',
      label: 'Active?',
      kind: 'condition',
      x: 340,
      y: 80,
      config: { left: '{{n1.body.status}}', op: 'eq', right: 'active' },
    },
    {
      id: 'n3',
      label: 'Shape row',
      kind: 'transform',
      x: 660,
      y: 0,
      config: { picks: [{ from: 'n1.body.name', to: 'name' }] },
    },
    { id: 'n4', label: 'Back off', kind: 'delay', x: 660, y: 180, config: { ms: 500 } },
    {
      id: 'n5',
      label: 'Log failure',
      kind: 'script',
      x: 340,
      y: 340,
      config: { command: 'echo "workflow failed" >&2', env: {} },
    },
    { id: 'n6', label: 'Retry gate', kind: 'agent', x: 660, y: 380, config: { agentId: 'claude', prompt: 'Check the shaped row.' } },
  ],
  edges: [
    { id: 'e-data', from: 'n1', to: 'n2', kind: 'data' },
    { id: 'e-true', from: 'n2', to: 'n3', fromPort: 'true', toPort: 'in', kind: 'conditional' },
    { id: 'e-false', from: 'n2', to: 'n4', fromPort: 'false', toPort: 'in', kind: 'conditional' },
    { id: 'e-error', from: 'n1', to: 'n5', fromPort: 'error', toPort: 'in', kind: 'error' },
    { id: 'e-fanout', from: 'n3', to: 'n6', kind: 'data' },
    { id: 'e-loop', from: 'n6', to: 'n3', fromPort: 'out', toPort: 'in', kind: 'loop' },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

const data: MockFixtures = { ...fixtures, appWorkflows: [EDGE_KINDS_WORKFLOW] };

/** The canvas measures its container on mount; give the resize a tick to settle, same margin `workflows-shots.spec.ts` gives it. */
const SETTLE_MS = 300;

async function openCanvas(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(async () => {
    await clickRailLink(page, 'Workflows');
    await expect(page.getByRole('button', { name: 'New workflow' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.getByText('Every edge kind').first().click();
  await page.locator('[data-node-id="n6"]').waitFor();
}

test.use({ viewport: SHOT_VIEWPORTS.wide });

for (const theme of ['light', 'dark'] as const) {
  test(`the workflow canvas draws every edge kind (${theme})`, async ({ page }) => {
    await openCanvas(page);
    if (theme === 'dark') await setTheme(page, 'dark');
    await page.waitForTimeout(SETTLE_MS);
    await prepareForVisualCapture(page);

    await expect(page.getByRole('application', { name: 'Workflow canvas' })).toHaveScreenshot(
      `workflows-canvas-edge-kinds-${theme}.png`,
    );
  });
}
