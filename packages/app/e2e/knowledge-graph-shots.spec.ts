import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  clickRailLink,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * Screenshots for the knowledge-graph interactivity pass (adhoc PR) —
 * gated on `MSTUDIO_SHOTS` like every other `*-shots.spec.ts`. A synthetic
 * 8-community / 240-node graph, deterministic (seeded LCG), laid out in
 * clusters so the pictures show what the real 15k-node graph looks like
 * from a distance without needing this repo's own `graph.json`.
 */
const OUT = '../../docs/screenshots/adhoc-knowledge-graph-interactive';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

type Graph = NonNullable<NonNullable<MockFixtures['knowledge']>['graph']>;

function syntheticGraph(): Graph {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };
  const communities = ['schemas.ts', 'graph-view.tsx', 'execGit', 'useUiStore', 'bridge', 'file-tree', 'terminal-store', 'knowledge-view.tsx'];
  const nodes: Graph['nodes'] = [];
  const links: Graph['links'] = [];
  const positions: Graph['positions'] = {};
  const perCommunity = 30;
  communities.forEach((name, c) => {
    const angle = (c / communities.length) * Math.PI * 2;
    const cx = Math.cos(angle) * 600;
    const cy = Math.sin(angle) * 600;
    for (let i = 0; i < perCommunity; i += 1) {
      const id = `${c}-${i}`;
      nodes.push({ id, label: `${name.replace(/\..*$/, '')}${i === 0 ? '' : i}`, community: c, communityName: name, fileType: 'code' });
      const r = 60 + rand() * 200;
      const a = rand() * Math.PI * 2;
      positions[id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
      if (i > 0) {
        links.push({ source: `${c}-0`, target: id, relation: 'calls', weight: 0.4 + rand() * 0.6, confidence: 1 });
        if (rand() < 0.4) links.push({ source: id, target: `${c}-${1 + Math.floor(rand() * (i))}`, relation: 'calls', weight: 0.3 + rand() * 0.5, confidence: 1 });
      }
    }
    for (let k = 0; k < 6; k += 1) {
      const other = (c + 1 + Math.floor(rand() * (communities.length - 1))) % communities.length;
      links.push({ source: `${c}-${Math.floor(rand() * perCommunity)}`, target: `${other}-${Math.floor(rand() * perCommunity)}`, relation: 'imports', weight: 0.6, confidence: 0.9 });
      links.push({ source: `${c}-0`, target: `${other}-0`, relation: 'calls', weight: 1, confidence: 1 });
    }
  });
  return { nodes, links, positions, builtAtCommit: 'deadbeef', cached: true, commitsBehind: 0 };
}

const graph = syntheticGraph();
const hubDetail = { sourceFile: 'packages/shared/src/ipc/schemas.ts', sourceLocation: 'L14' };
const schemasSource = Array.from({ length: 80 }, (_, i) =>
  i === 13
    ? 'export const BlameReadRequestSchema = z.object({ repoId: z.string(), relPath: z.string() });'
    : `export const Line${i}Schema = z.object({ value: z.number() }); // ${i}`,
).join('\n');

const knowledgeFixtures: MockFixtures = {
  ...fixtures,
  knowledge: {
    graph,
    nodeDetails: Object.fromEntries(graph.nodes.map((n) => [n.id, hubDetail])),
  },
  fsFiles: {
    'repo:packages/shared/src/ipc/schemas.ts': { kind: 'text', content: schemasSource, size: schemasSource.length },
  },
};

async function open(page: Page, mode: 'dark' | 'light'): Promise<void> {
  await page.setViewportSize({ width: 1480, height: 920 });
  await installMockBridge(page, knowledgeFixtures);
  await page.goto('/');
  await setTheme(page, mode);
  await clickRailLink(page, 'Knowledge');
  await expect(page.getByTestId('knowledge-canvas').locator('canvas').first()).toBeVisible();
  // `clickRailLink` leaves the pointer over the rail, which expands it; park it on the filters panel.
  await page.mouse.move(500, 600);
  await page.waitForTimeout(400);
}

function centre(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

for (const mode of ['dark', 'light'] as const) {
  test(`knowledge graph at rest (${mode})`, async ({ page }) => {
    await open(page, mode);
    await page.screenshot({ path: shotPath(OUT, `graph-rest-${mode}-${VARIANT}.png`) });
  });

  test(`selected node lights its neighbourhood, the rest dims (${mode})`, async ({ page }) => {
    await open(page, mode);
    // Fly to a hub through search so the click lands on a known node, then
    // clear the search so the SELECTION alone is what lights the graph.
    const search = page.getByRole('textbox', { name: 'Search knowledge graph nodes' });
    await search.fill('execGit');
    await page.waitForTimeout(600);
    const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
    const c = centre(box);
    await page.mouse.move(c.x, c.y);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText('Knowledge · node')).toBeVisible();
    await search.fill('');
    // Park the pointer on the filters panel so no hover is in the picture (and the rail stays collapsed).
    await page.mouse.move(box.x - 120, box.y + box.height / 2);
    await page.waitForTimeout(600);
    await page.screenshot({ path: shotPath(OUT, `graph-selected-${mode}-${VARIANT}.png`) });
  });

  test(`the node panel's editor fills the panel height (${mode})`, async ({ page }) => {
    await open(page, mode);
    await page.getByRole('textbox', { name: 'Search knowledge graph nodes' }).fill('execGit');
    await page.waitForTimeout(600);
    const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
    const c = centre(box);
    await page.mouse.click(c.x, c.y);
    await expect(page.getByText('Knowledge · node')).toBeVisible();
    // The reported bug: switching the preview into the real editor left it a
    // few pixels tall — Monaco measures its container, and the container had
    // no height to give it.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: shotPath(OUT, `graph-editor-${mode}-${VARIANT}.png`) });
  });
}

test('communities collapsed into meta-nodes, tree list open (dark)', async ({ page }) => {
  await open(page, 'dark');
  await page.getByRole('button', { name: /^Communities/ }).click();
  await page.getByRole('button', { name: 'Tree', exact: true }).click();
  await page.getByRole('button', { name: 'Expand schemas.ts', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse execGit into one node' }).click();
  await page.getByRole('button', { name: 'Collapse bridge into one node' }).click();
  await page.getByRole('button', { name: 'Collapse file-tree into one node' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shotPath(OUT, `graph-collapsed-tree-dark-${VARIANT}.png`) });
});

test('everything collapsed: the community map (dark)', async ({ page }) => {
  await open(page, 'dark');
  await page.getByRole('button', { name: /^Communities/ }).click();
  await page.getByText('Collapse all').click();
  await page.waitForTimeout(500);
  const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
  const c = centre(box);
  // Hover somewhere central so at least one meta-node's neighbourhood is lit if the pointer lands on one.
  await page.mouse.move(c.x, c.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(OUT, `graph-all-collapsed-dark-${VARIANT}.png`) });
});
