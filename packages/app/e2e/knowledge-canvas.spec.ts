import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 89 Theme B's expand-from-a-core intro (`knowledge-intro.ts`) moves
 * every node from the graph's centroid to its laid-out position over ~1.25s
 * on mount, and this suite hit-tests FIXED screen points against nodes at
 * their FINAL laid-out coordinates the instant the canvas appears — exactly
 * the assumption the burst breaks for that window. The intro already has an
 * off switch, `prefers-reduced-motion` (final positions on first paint, no
 * burst at all — see `use-sigma-graph.ts`'s `shouldAnimateIntro`), which is
 * the right lever here: this suite is about hit-testing, not motion, so it
 * asks for the graph to be at rest from the first frame rather than adding
 * a wall-clock wait (`docs/TESTING.md`'s rule against exactly that).
 */
test.use({ reducedMotion: 'reduce' });

/**
 * Playwright/real-browser: Phase 87 Theme G's own "canvas only" carve-out
 * (see the phase doc's Theme G and `docs/TESTING.md`'s decision rule). This
 * file is the ONE place the Knowledge feature needs a real browser rather
 * than vitest/jsdom — every filter/search/state reducer already has its own
 * vitest suite with `KnowledgeCanvas` mocked out (`knowledge-view.test.tsx`),
 * because jsdom has no WebGL at all. What jsdom genuinely cannot give this
 * feature, and what each test below exercises for real:
 *
 *   - a real WebGL context (`sigma` will not construct one under jsdom)
 *   - real `getBoundingClientRect` geometry, to turn a node's graph
 *     coordinates into an actual pixel to click
 *   - real pointer clicks, hit-tested by sigma's own quadtree against
 *     WebGL-rendered geometry — nothing here is a DOM element a
 *     `getByRole` query could ever find
 *   - a real pointer drag, to pan the camera
 *
 * The fixture graph is small and hand-placed (not this repo's own
 * 14,881-node graph) so the expected screen position of each node is
 * computable by hand: five nodes on a small cross, `hub` exactly at the
 * bounding box's centre — which is where sigma's OWN default camera state
 * (`{x: 0.5, y: 0.5, ratio: 1}`) frames the graph, regardless of container
 * size — and four arms 100 units out in each direction, giving `hub` the
 * highest degree (4) and so the largest, easiest-to-hit node radius
 * (`sizeForDegree`, vitest-covered on its own).
 */

const graph: NonNullable<MockFixtures['knowledge']>['graph'] = {
  nodes: [
    { id: 'hub', label: 'useNow', community: 0, communityName: 'core', fileType: 'code' },
    { id: 'east', label: 'useNowTick', community: 1, communityName: 'edge', fileType: 'code' },
    { id: 'west', label: 'useNowLoop', community: 1, communityName: 'edge', fileType: 'code' },
    { id: 'north', label: 'useNowReset', community: 2, communityName: 'outer', fileType: 'code' },
    { id: 'south', label: 'useNowClear', community: 2, communityName: 'outer', fileType: 'code' },
  ],
  links: [
    { source: 'hub', target: 'east', relation: 'calls', weight: 1, confidence: 1 },
    { source: 'hub', target: 'west', relation: 'calls', weight: 1, confidence: 1 },
    { source: 'hub', target: 'north', relation: 'calls', weight: 1, confidence: 1 },
    { source: 'hub', target: 'south', relation: 'calls', weight: 1, confidence: 1 },
  ],
  positions: {
    hub: { x: 0, y: 0 },
    east: { x: 100, y: 0 },
    west: { x: -100, y: 0 },
    north: { x: 0, y: 100 },
    south: { x: 0, y: -100 },
  },
  builtAtCommit: 'deadbeef',
  cached: true,
  commitsBehind: 0,
};

const knowledgeFixtures: MockFixtures = {
  ...fixtures,
  knowledge: {
    graph,
    nodeDetails: {
      hub: { sourceFile: 'src/hub.ts', sourceLocation: '1:1' },
      east: { sourceFile: 'src/east.ts', sourceLocation: '3:1' },
    },
  },
  fsFiles: {
    'repo:src/hub.ts': { kind: 'text', content: 'export function hub() {}\n', size: 26 },
    'repo:src/east.ts': { kind: 'text', content: '\n\nexport function east() {}\n', size: 28 },
  },
};

async function openKnowledge(page: Page): Promise<void> {
  await installMockBridge(page, knowledgeFixtures);
  await page.goto('/');
  await clickRailLink(page, 'Knowledge');
  await expect(page.getByTestId('knowledge-canvas')).toBeVisible();
  // Real WebGL: sigma mounts several stacked `<canvas>` layers into the
  // container (webgl, edges, nodes, labels, mouse/hover, hitbox) — asserting
  // at least one exists, sized, is the jsdom-can't-do-this baseline every
  // test below builds on.
  const canvas = page.locator('[data-testid="knowledge-canvas"] canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
}

function nodePanel(page: Page) {
  return page.getByText('Knowledge · node');
}

test('a real pointer click hit-tests the WebGL canvas and opens the clicked node’s file', async ({
  page,
}) => {
  await openKnowledge(page);
  const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // `hub` sits at the bounding box's own centre, which is exactly where
  // sigma's default (un-panned, un-searched) camera frames the graph —
  // see the fixture's own doc comment.
  await page.mouse.click(center.x, center.y);

  await expect(nodePanel(page)).toBeVisible();
  await expect(page.getByText('src/hub.ts')).toBeVisible();
});

test('a real pointer drag pans the camera, so a fixed screen point stops hitting the node it used to', async ({
  page,
}) => {
  await openKnowledge(page);
  const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // Confirm the baseline: centre hits `hub` before any panning.
  await page.mouse.click(center.x, center.y);
  await expect(nodePanel(page)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(nodePanel(page)).toBeHidden();

  // A real pointer drag (down, several intermediate moves, up) — sigma's own
  // pan gesture, which only a real pointer sequence can drive at all; a
  // single `mouse.move` with no `down` first is not a drag.
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(center.x - (box.width / 2) * (i / steps), center.y, { steps: 2 });
  }
  await page.mouse.up();

  // `hub` panned away with the drag, so the same fixed screen point (the
  // container's centre) no longer hits it — the node's own panel never
  // reappears. A generous wait rather than a fixed sleep: absence is
  // asserted as a stable end-state, not raced against the drag's own
  // (synchronous, non-animated) camera update.
  await page.mouse.click(center.x, center.y);
  await expect(nodePanel(page)).toBeHidden();
});

test('typing a symbol into search flies the camera to it, centring it under a fixed screen point', async ({
  page,
}) => {
  await openKnowledge(page);
  const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // Before searching, the centre hits `hub` (the fixture's own baseline).
  await page.mouse.click(center.x, center.y);
  await expect(nodePanel(page)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(nodePanel(page)).toBeHidden();

  // `east` is the only node whose label contains "Tick" — `searchMatches`'s
  // substring match, vitest-covered on its own; what jsdom cannot cover is
  // whether the resulting camera fly (`use-sigma-graph.ts`'s `camera.animate`,
  // 400ms) actually lands on it well enough for a real click to hit it.
  await page.getByRole('textbox', { name: 'Search knowledge graph nodes' }).fill('Tick');
  await page.waitForTimeout(700);

  await page.mouse.click(center.x, center.y);
  await expect(nodePanel(page)).toBeVisible();
  await expect(page.getByText('src/east.ts')).toBeVisible();
});

test('a real double-click on a node folds its community into one meta-node, and the community panel explains it', async ({
  page,
}) => {
  await openKnowledge(page);
  const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // sigma's own double-click would zoom the camera; ours must swallow it and
  // collapse `hub`'s community (`core`, whose only member is `hub`, so the
  // meta-node stands exactly where `hub` stood — the centroid of one point).
  await page.mouse.dblclick(center.x, center.y);

  const communityPanel = page.getByTestId('knowledge-community-panel');
  await expect(communityPanel).toBeVisible();
  await expect(communityPanel.getByText('core', { exact: true })).toBeVisible();
  await expect(communityPanel.getByText(/1 node, collapsed into one/)).toBeVisible();

  // Expanding puts `hub` back under the same pixel: a single click there
  // opens its FILE again, proving the meta-node was swapped out for the node.
  await communityPanel.getByText('Expand on canvas').click();
  await expect(communityPanel).toBeHidden();
  await page.mouse.click(center.x, center.y);
  await expect(nodePanel(page)).toBeVisible();
  await expect(page.getByText('src/hub.ts')).toBeVisible();
});

test('picking a member in the community tree flies the camera to it, so the centre now hits that node', async ({
  page,
}) => {
  await openKnowledge(page);
  const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.getByRole('button', { name: /^Communities/ }).click();
  await page.getByRole('button', { name: 'Tree', exact: true }).click();
  await page.getByRole('button', { name: 'Expand edge', exact: true }).click();
  // `east` (`useNowTick`) sits 100 units right of `hub`; the pick selects it
  // (its file opens) AND flies the camera — `use-sigma-graph.ts`'s effect (3),
  // 400ms — which only a real canvas can show landed.
  await page.getByRole('button', { name: 'useNowTick', exact: true }).click();
  await expect(page.getByText('src/east.ts')).toBeVisible();
  await page.waitForTimeout(700);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(nodePanel(page)).toBeHidden();
  await page.mouse.click(center.x, center.y);
  await expect(nodePanel(page)).toBeVisible();
  await expect(page.getByText('src/east.ts')).toBeVisible();
});
