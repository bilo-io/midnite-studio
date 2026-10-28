/**
 * knowledge-dark — the Knowledge view over a real slice of this repo's graphify
 * graph (13 code communities, the 40 best-connected symbols of each, ~520 nodes,
 * ~2.3k links). Positions come from fixtures/layout-knowledge.mjs, run offline.
 * Zoom into a cluster, hover symbols, open one, ease back out.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, placeCursor, preparePage, Recorder, settlePage } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';

// sigma is WebGL; SwiftShader at DSF 2 drops the screencast to ~8 fps in places.
// Hand it the real GPU.
test.use({
  launchOptions: {
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader=false'],
  },
});

const sample = JSON.parse(readFileSync(`${__dirname}/../fixtures/data/knowledge-sample.json`, 'utf8')) as {
  nodes: unknown[];
  links: unknown[];
  positions: Record<string, { x: number; y: number }>;
  details: Record<string, { sourceFile: string; sourceLocation: string }>;
  builtAtCommit: string;
};

const REPO = `${__dirname}/../../../../../../..`;
const FOCUS = 'useTerminalStore';
const focusFile = sample.details[
  (sample.nodes as { id: string; label: string }[]).find((n) => n.label === FOCUS)!.id
]!.sourceFile;
const focusSource = readFileSync(`${REPO}/${focusFile}`, 'utf8');

async function openKnowledge(page: Page): Promise<void> {
  await installMockBridge(
    page,
    roadmapFixtures({
      knowledge: {
        graph: {
          nodes: sample.nodes,
          links: sample.links,
          positions: sample.positions,
          builtAtCommit: sample.builtAtCommit || '6380f1d8',
          cached: true,
          commitsBehind: 0,
        },
        nodeDetails: sample.details,
      },
      fsFiles: { [`repo:${focusFile}`]: { kind: 'text', content: focusSource, size: focusSource.length } },
    } as never),
    { cspGuard: false },
  );
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await clickRailLink(page, 'Knowledge');
  await expect(page.locator('[data-testid="knowledge-canvas"] canvas').first()).toBeVisible({ timeout: 20_000 });
  // Show every relation, not just `calls`.
  const toggled = await page.evaluate(async () => {
    let n = 0;
    for (const label of document.querySelectorAll('label')) {
      const input = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const text = label.textContent?.trim() ?? '';
      if (!input || input.checked || !/^[a-z_]+$/.test(text)) continue;
      input.click();
      n++;
      await new Promise((r) => setTimeout(r, 60));
    }
    return n;
  });
  console.log('[capture] relations toggled', toggled);
  await placeCursor(page, 900, 500);
  await settlePage(page, 2500);
}

test('knowledge-dark', async ({ page }) => {
  await openKnowledge(page);
  const box = (await page.getByTestId('knowledge-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const search = page.getByPlaceholder('Search nodes…').or(page.getByPlaceholder('Search nodes...'));
  const rec = new Recorder(page, 'knowledge-dark');
  await rec.start();
  await page.waitForTimeout(700);
  // Drift over the whole graph first.
  await glide(page, cx + 140, cy - 120, 1200);
  await glide(page, cx - 120, cy + 60, 1000);
  await glideTo(page, search, 800, { x: 0.3, y: 0.5 });
  await click(page);
  // All at once: letter-by-letter matches hundreds of nodes and floods the labels.
  await page.keyboard.insertText(FOCUS);
  await page.waitForTimeout(1600);
  // The camera has flown to the symbol; open it.
  await glide(page, cx, cy, 900);
  await click(page);
  await expect(page.getByText('Knowledge · node')).toBeVisible();
  await page.waitForTimeout(1200);
  await glide(page, cx - 160, cy - 80, 1100);
  await page.waitForTimeout(1200);
  await rec.stop();
});
