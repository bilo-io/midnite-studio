import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

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

/**
 * A palette row (Phase 95 Theme I) is a real `<button>`, but wears
 * `role="listitem"` under its `role="list"` container (`node-palette.tsx`)
 * so the palette reads as an accessible list rather than a button toolbar —
 * an explicit `role` overrides an element's implicit one, so `getByRole`
 * has to ask for "listitem" here, not "button".
 */
async function addNode(page: Page, label: string): Promise<void> {
  await page.getByRole('listitem', { name: `Add ${label} node` }).click();
}

/**
 * Drags a node's own card by a fixed offset so two newly-added nodes (which
 * land on the same spot) separate — the drag target is the card `div`
 * itself (Phase 95 Theme I's React Flow port; the old hand-rolled SVG
 * canvas's own `<rect>` child no longer exists), which sits inside React
 * Flow's own `.react-flow__node` wrapper and still starts that wrapper's
 * drag on a plain mousedown/move/up.
 */
async function dragNodeBy(page: Page, nodeId: string, dx: number, dy: number): Promise<void> {
  const node = page.locator(`[data-node-id="${nodeId}"]`);
  const box = await node.boundingBox();
  if (!box) throw new Error(`node ${nodeId} has no bounding box`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 5 });
  await page.mouse.up();
}

/**
 * Drags from the source node's right (source) Handle to the target node's
 * left (target) Handle — React Flow's default `connectionMode: 'strict'`
 * (never overridden here) requires landing on a compatible Handle exactly,
 * not merely inside the target node's body, unlike the old SVG canvas's own
 * "anywhere near the in-port" tolerance. `data-nodeid`/`data-handlepos` are
 * `@xyflow/react`'s own `Handle` attributes (`workflow-node-view.tsx`'s
 * `Handle type="source" position={Position.Right}`, etc.) — not this app's
 * `data-node-id`, which only ever names the *card*.
 */
async function connect(page: Page, fromNodeId: string, toNodeId: string): Promise<void> {
  const outHandle = page.locator(`[data-nodeid="${fromNodeId}"][data-handlepos="right"]`);
  const inHandle = page.locator(`[data-nodeid="${toNodeId}"][data-handlepos="left"]`);
  const outBox = await outHandle.boundingBox();
  const inBox = await inHandle.boundingBox();
  if (!outBox || !inBox) throw new Error('handle has no bounding box');
  await page.mouse.move(outBox.x + outBox.width / 2, outBox.y + outBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(inBox.x + inBox.width / 2, inBox.y + inBox.height / 2, { steps: 8 });
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

/**
 * `workflow.run` (Theme I) — the palette's own way in, over the same
 * `useWorkflowRunCommandStore` seam the canvas's Run button already used.
 * Only the assembled app (palette + keybindings + the registered handle) can
 * show this actually reaches the open workflow, not a mock of any one part.
 */
test('the "Run Workflow" palette command runs the currently open workflow', async ({ page }) => {
  await open(page);
  await createWorkflow(page);
  await addNode(page, 'HTTP');
  await page.locator('[data-node-id]').first().click();
  await page.getByLabel('URL').fill('https://example.com');
  await page.waitForTimeout(600);

  await page.keyboard.press('Meta+k');
  await page.getByRole('combobox', { name: 'Command palette search' }).fill('run workflow');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Run history' }).click();
  await expect(page.getByText('Completed')).toBeVisible();
});

/**
 * The demo API pill (Theme D's carried-over item). `demo-api-pill.test.tsx`
 * covers the component in isolation with a mocked bridge — what only the
 * assembled app can show is that starting it for real then wires an actual
 * `http` node's URL field, through the canvas and the inspector both.
 */
test('the demo API pill starts the server and inserts its URL into the selected http node', async ({
  page,
}) => {
  await open(page);
  await createWorkflow(page);

  await expect(page.getByText('Demo API · stopped')).toBeVisible();
  await expect(page.getByTitle('Insert base URL into the selected node')).toHaveCount(0);

  await page.getByRole('button', { name: 'start' }).click();
  await expect(page.getByText('Demo API · running on :54321')).toBeVisible();

  await addNode(page, 'HTTP');
  await page.locator('[data-node-id]').first().click();
  await expect(page.getByLabel('URL')).toHaveValue('');

  await page.getByTitle('Insert base URL into the selected node').click();
  await expect(page.getByLabel('URL')).toHaveValue('http://127.0.0.1:54321');

  await page.getByRole('button', { name: 'stop' }).click();
  await expect(page.getByText('Demo API · stopped')).toBeVisible();
  await expect(page.getByTitle('Insert base URL into the selected node')).toHaveCount(0);
});

/**
 * Drag-from-palette (Phase 95 Theme I) — the phase doc names this as one of
 * the two flows that genuinely need a real browser (real pointer + native
 * HTML5 drag-and-drop, which `node-palette.test.tsx`'s jsdom `fireEvent`
 * coverage only fakes the `dataTransfer` payload for, never a real drag
 * gesture) rather than a vitest/jsdom test. `NodePalette`'s row carries a
 * real `draggable` attribute and `workflow-canvas.tsx`'s `onDrop` reads
 * `event.clientX/Y` through `screenToFlowPosition` — both only mean anything
 * under a real compositor.
 */
test('drag-from-palette: dragging a node kind onto the canvas adds it where it was dropped', async ({
  page,
}) => {
  await open(page);
  await createWorkflow(page);

  const source = page.getByRole('listitem', { name: 'Add Condition node' });
  const target = canvas(page);
  await source.dragTo(target, { targetPosition: { x: 260, y: 160 } });

  await expect(page.locator('[data-node-id]')).toHaveCount(1);
  await expect(canvas(page).getByText('CONDITION', { exact: true })).toBeVisible();
});

/**
 * Panel-resize (Phase 95 Theme I) — the second of the phase doc's two
 * real-browser-only flows: `useResizable`'s pointer math reads real
 * `getBoundingClientRect()`/`clientX` values, which are always `{0,0,0,0}`/0
 * under jsdom (`workflows-resizable.test.tsx` covers this hook's keyboard
 * path instead, deliberately, for exactly that reason). This exercises the
 * bottom run panel's own resize handle — the one surface this theme adds —
 * with a real pointer drag, not a keyboard nudge.
 */
test('panel-resize: dragging the run panel handle changes its height', async ({ page }) => {
  await open(page);
  await createWorkflow(page);

  await page.getByText('Run output').click();

  const handle = page.getByRole('separator', { name: 'Resize run output panel' });
  const before = await handle.boundingBox();
  if (!before) throw new Error('resize handle has no bounding box');

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2, before.y - 60, { steps: 8 });
  await page.mouse.up();

  const after = await handle.boundingBox();
  if (!after) throw new Error('resize handle lost its bounding box after dragging');
  expect(after.y).not.toBeCloseTo(before.y, 0);
});
