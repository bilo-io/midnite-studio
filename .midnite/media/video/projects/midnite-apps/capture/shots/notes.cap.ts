/**
 * notes-dark — Notes: a repo's captured thoughts. Capture one live (type,
 * Enter), then open an older one in the editor.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage, typeSlow } from '../lib';
import { REPO_ID, roadmapFixtures } from '../fixtures/roadmap';

const NOW = Date.now();
const MIN = 60_000;
const NOTES = [
  ['Ship the launcher auto-update channel default-off in v0.0.5 — flip it on once one update has round-tripped on a clean profile.', 'planned', false, 40],
  ['e2e shards: 4 is the ceiling while macOS concurrency is capped at 5. Re-measure before adding a fifth.', 'implemented', true, 95],
  ['Knowledge view: cold load is ~11 s on the 15k-node graph. Cache the layout per builtAtCommit.', 'captured', false, 180],
  [
    'Councils — let a member cite the file and line it read, so the synthesis can link straight to it.\n\n' +
      '## Shape\n\n' +
      '- each member answer carries `{ file, line }` beside the claim it backs\n' +
      '- the synthesis renders those as links that open in Explorer\n' +
      '- a citation the member never read is dropped, not shown\n\n' +
      '## Open\n\n' +
      '- [ ] add `citations` to the run member schema\n' +
      '- [ ] decide whether the Release council gets it first',
    'captured',
    false,
    320,
  ],
  ['Terrain: export a 16-bit PNG heightmap alongside the glTF for Godot.', 'planned', false, 610],
  ['Sessions list: group exited sessions under their worktree instead of a flat list.', 'implemented', true, 1440],
].map(([body, status, done, ago], i) => ({
  id: `note-${i + 1}`,
  repoId: REPO_ID,
  body: `${body}`,
  status,
  done,
  createdAt: NOW - (ago as number) * MIN,
  updatedAt: NOW - (ago as number) * MIN,
  order: i,
}));

const THOUGHT = 'Graphs: let the camera follow the running wave during a run, so a long chain stays on screen.';

async function openNotes(page: Page): Promise<void> {
  await installMockBridge(page, roadmapFixtures({ notes: NOTES } as never), { cspGuard: false });
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await gotoView(page, 'Notes');
    await expect(page.getByText(/Ship the launcher auto-update/).first()).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  // Warm the lazily-loaded editor so it is not "Loading editor…" on camera.
  await page.getByText(/Ship the launcher auto-update/).first().click();
  await expect(page.getByText('Loading editor...').or(page.getByText('Loading editor…'))).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(800);
  await placeCursor(page, 900, 500);
  await settlePage(page, 1000);
}

test('notes-dark', async ({ page }) => {
  await openNotes(page);
  const capture = page.getByPlaceholder(/Capture a thought/);
  const rec = new Recorder(page, 'notes-dark');
  await rec.start();
  await page.waitForTimeout(600);
  await glideTo(page, capture, 900, { x: 0.3, y: 0.3 });
  await click(page);
  await typeSlow(page, THOUGHT, 28);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1100);
  await glideTo(page, page.getByText(/Councils — let a member/).first(), 1000, { x: 0.3, y: 0.5 });
  await click(page);
  await page.waitForTimeout(1200);
  await glide(page, 900, 300, 800);
  await page.waitForTimeout(500);
  const preview = page.getByRole('button', { name: /preview/i }).first();
  if (await preview.count()) {
    await glideTo(page, preview, 800);
    await click(page);
  }
  await page.waitForTimeout(1600);
  await rec.stop();
});
