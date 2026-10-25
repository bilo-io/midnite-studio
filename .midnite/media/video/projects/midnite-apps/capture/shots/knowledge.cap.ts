/**
 * knowledge-dark — the Knowledge view with the 3D presentation engine (Telemetry HUD),
 * rotating the camera in 3D space, highlighting nodes, searching for symbols,
 * and opening node source details.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, placeCursor, preparePage, Recorder, settlePage } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';

// Use the GPU for 3D canvas and smooth rotation
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
  
  // Switch to the 3D representation: Telemetry HUD (telemetry-3d)
  const pill3D = page.getByRole('button', { name: /Telemetry HUD|3D/i });
  if (await pill3D.isVisible()) {
    await pill3D.click();
  } else {
    // If inside overflow menu or set directly via store
    await page.evaluate(() => {
      // @ts-expect-error accessing store directly if available
      window.__useKnowledgeFiltersStore?.getState?.().setRendererVariant?.('telemetry-3d');
    });
  }

  // Ensure the 3D canvas is mounted
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });

  // Show relations
  await page.evaluate(async () => {
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
  await placeCursor(page, 900, 500);
  await settlePage(page, 2000);
}

test('knowledge-dark', async ({ page }) => {
  await openKnowledge(page);
  const canvas = page.locator('canvas[data-testid="knowledge-3d-canvas"]').or(page.locator('canvas').first());
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const search = page.getByPlaceholder('Search nodes…').or(page.getByPlaceholder('Search nodes...'));
  
  const rec = new Recorder(page, 'knowledge-dark');
  await rec.start();
  await page.waitForTimeout(600);

  // 1. 3D orbit / rotation by dragging across the canvas
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 180, cy - 80, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  // 2. Highlighting nodes: glide through clusters to show neon highlights & tooltips
  await glide(page, cx - 120, cy + 90, 900);
  await page.waitForTimeout(400);
  await glide(page, cx + 80, cy - 110, 800);
  await page.waitForTimeout(400);

  // 3. Search and focus symbol with 3D camera travel
  await glideTo(page, search, 700, { x: 0.3, y: 0.5 });
  await click(page);
  await page.keyboard.insertText(FOCUS);
  await page.waitForTimeout(1400);

  // 4. Click the focused node to open node details panel
  await glide(page, cx, cy, 800);
  await click(page);
  await page.waitForTimeout(1200);

  // 5. Final slow orbit in 3D around highlighted node
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 100, cy + 60, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  await rec.stop();
});
