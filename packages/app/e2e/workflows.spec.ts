import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Workflows (Phase 43 Themes E, H), assembled.
 *
 * The engine's own topological run is main-only and already covered by
 * `workflow-engine.test.ts` — the mock's `workflow.run` answers with an
 * already-`completed` run rather than choreographing a fake execution, the
 * same call `councils.spec.ts` makes for its own run.start. What only the
 * assembled app can show is the canvas itself: adding/connecting/selecting/
 * deleting/undoing nodes, and the list's create/duplicate/delete/import.
 */

async function open(page: Page, data: MockFixtures = fixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  // Same pre-existing first-nav-click flakiness `councils.spec.ts` documents
  // (reproduces identically on this link) — retry rather than chase the race.
  await expect(async () => {
    await clickRailLink(page, 'Workflows');
    await expect(page.getByRole('button', { name: 'New workflow' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

const canvas = (page: Page) => page.getByRole('application', { name: 'Workflow canvas' });

async function createWorkflow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New workflow' }).click();
  await expect(canvas(page)).toBeVisible();
}

async function addNode(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: `Add ${label} node` }).click();
}

/** Drags a node's body by a fixed offset so two newly-added nodes (which land on the same spot) separate. */
async function dragNodeBy(page: Page, nodeId: string, dx: number, dy: number): Promise<void> {
  const rect = page.locator(`[data-node-id="${nodeId}"] rect`);
  const box = await rect.boundingBox();
  if (!box) throw new Error(`node ${nodeId} has no bounding box`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 5 });
  await page.mouse.up();
}

/**
 * Drags from the source node's out-port to a point just inside the target
 * node's body (rather than the in-port's exact edge coordinate) — the drop
 * check is "inside the target node's bounding box", and landing exactly on a
 * boundary risks a sub-pixel rounding miss between screen and graph space.
 */
async function connect(page: Page, fromNodeId: string, toNodeId: string): Promise<void> {
  const outPort = page.locator(`[data-node-id="${fromNodeId}"] [data-port="out"]`);
  const targetRect = page.locator(`[data-node-id="${toNodeId}"] rect`);
  const outBox = await outPort.boundingBox();
  const targetBox = await targetRect.boundingBox();
  if (!outBox || !targetBox) throw new Error('port or node has no bounding box');
  await page.mouse.move(outBox.x + outBox.width / 2, outBox.y + outBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + 20, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('the empty state renders with no workflows', async ({ page }) => {
  await open(page);
  await expect(page.getByText('No workflows yet')).toBeVisible();
});

test('creating a workflow selects it and shows the canvas', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await expect(page.getByText('Untitled workflow')).toBeVisible();
  await expect(canvas(page)).toBeVisible();
});

test('adds a node from the toolbar', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await addNode(page, 'HTTP');
  await expect(page.locator('[data-node-id]')).toHaveCount(1);
  await expect(canvas(page).getByText('HTTP', { exact: true })).toBeVisible();
});

test('connects two nodes with an edge, rejecting the cycle it would create back', async ({ page }) => {
  await open(page);
  await createWorkflow(page);

  await addNode(page, 'HTTP');
  const first = await page.locator('[data-node-id]').first().getAttribute('data-node-id');
  if (!first) throw new Error('first node has no id');
  await dragNodeBy(page, first, -150, -80);
  await expect(page.locator('[data-node-id]')).toHaveCount(1);

  await addNode(page, 'Transform');
  await expect(page.locator('[data-node-id]')).toHaveCount(2);
  const ids = await page.locator('[data-node-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id')));
  const second = ids.find((id) => id !== first);
  if (!second) throw new Error('second node has no id');

  await connect(page, first, second);
  await expect(page.locator('[data-edge-id]')).toHaveCount(1);

  // The reverse direction would create a 2-node cycle — refused at draw time.
  await connect(page, second, first);
  await expect(page.locator('[data-edge-id]')).toHaveCount(1);
});

test('selects a node and removes it on Delete', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await addNode(page, 'Note');

  const nodeEl = page.locator('[data-node-id]').first();
  await nodeEl.click();
  await canvas(page).press('Delete');

  await expect(page.locator('[data-node-id]')).toHaveCount(0);
});

test('Undo restores a deleted node and Redo removes it again', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await addNode(page, 'Note');
  await expect(page.locator('[data-node-id]')).toHaveCount(1);

  const nodeEl = page.locator('[data-node-id]').first();
  await nodeEl.click();
  await canvas(page).press('Delete');
  await expect(page.locator('[data-node-id]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-node-id]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
});

test('duplicates a workflow from the list context menu', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await addNode(page, 'Note');

  // Wait for the auto-save to land before duplicating — the list row's own
  // node count is the signal, since `Duplicate` clones the list's last
  // *saved* copy of the workflow, not the canvas's in-progress edit.
  await expect(page.getByText('1 node', { exact: true })).toBeVisible();

  await page.getByText('Untitled workflow').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();

  await expect(page.getByText('Untitled workflow (copy)')).toBeVisible();
  // The duplicate carries its own node, with a fresh id — not the original.
  await expect(page.locator('[data-node-id]')).toHaveCount(1);
});

test('deletes a workflow from the list after the destructive confirm', async ({ page }) => {
  await open(page);
  await createWorkflow(page);

  await page.getByText('Untitled workflow').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('No workflows yet')).toBeVisible();
});

/**
 * The node inspector (Theme F). `workflow-canvas.test.tsx` and
 * `node-inspector.test.tsx` already exercise the form/validation logic in
 * isolation — this is the one thing only the assembled app can show: that
 * selecting a node on the real canvas actually opens the real inspector
 * wired to the real Run button, not a mock of either.
 */
test('selecting a node opens its inspector, and an invalid URL disables Run', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await addNode(page, 'HTTP');

  await page.locator('[data-node-id]').first().click();
  await expect(page.getByLabel('URL')).toBeVisible();

  const run = page.getByRole('button', { name: 'Run', exact: true });
  await expect(run).toBeDisabled();
  await expect(run).toHaveAttribute('title', /has no URL/);

  await page.getByLabel('URL').fill('https://example.com');
  await expect(run).toBeEnabled();
});

test('deselecting every node closes the inspector', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await addNode(page, 'HTTP');

  await page.locator('[data-node-id]').first().click();
  await expect(page.getByLabel('URL')).toBeVisible();

  await canvas(page).press('Escape');
  await expect(page.getByText('Select a node to configure it.')).toBeVisible();
});

/**
 * The run view (Theme G). Only the assembled app can show that a real Run
 * actually lands in the history popover and that picking it really swaps the
 * canvas into read-only mode with the right-hand pane showing the run's own
 * result rather than the editable form.
 */
test('running a workflow, viewing it in history, and returning to editing', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await addNode(page, 'HTTP');
  await page.locator('[data-node-id]').first().click();
  await page.getByLabel('URL').fill('https://example.com');

  // The mock's `workflow.run()` reads the last **saved** workflow, exactly
  // as the real IPC does — wait out the auto-save debounce so Run doesn't
  // fire against the pre-edit (0-node-config) snapshot.
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  await page.getByRole('button', { name: 'Run history' }).click();
  await page.getByText('Completed').click();

  await expect(page.getByText('Viewing run')).toBeVisible();
  await expect(page.getByLabel('URL')).toHaveCount(0);

  await page.locator('[data-node-id]').first().click();
  await expect(page.getByText('Succeeded')).toBeVisible();

  await page.getByRole('button', { name: 'Back to editing' }).click();
  await expect(page.getByText('Viewing run')).toHaveCount(0);
});
