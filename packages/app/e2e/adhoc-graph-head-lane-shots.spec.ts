import { expect, test } from '@playwright/test';

import { fixtures, installMockBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

// HEAD (the mock bridge's status oid is 40 x 'a') is on `feature`, lane 1; a
// second lane, `main`, hashes to the SAME palette slot to prove only HEAD's lane
// turns primary.
const TEMPLATE = (fixtures.graphRows[0] ?? {}) as { commit: Record<string, unknown> };
const sha = (c: string) => c.repeat(40);
const commit = (c: string, parents: string[], subject: string, refs: string[] = []) => ({
  ...TEMPLATE.commit, sha: sha(c), parents: parents.map(sha), subject, refs,
});
const edge = (fromLane: number, toLane: number, type: string, colorIdx: number) => ({ fromLane, toLane, type, colorIdx });
const ROWS = [
  { row: 0, commit: commit('b', ['d'], 'fix: main moves on', ['refs/heads/main']), lane: 0, colorIdx: 2, laneCount: 2,
    edges: [edge(0, 0, 'straight', 2)] },
  { row: 1, commit: commit('a', ['c'], 'feat: work on the checked-out branch', ['HEAD -> refs/heads/feature']), lane: 1, colorIdx: 2, laneCount: 2,
    edges: [edge(0, 0, 'straight', 2), edge(1, 1, 'straight', 2)] },
  { row: 2, commit: commit('c', ['d'], 'feat: start the branch'), lane: 1, colorIdx: 2, laneCount: 2,
    edges: [edge(0, 0, 'straight', 2), edge(1, 0, 'merge', 2)] },
  { row: 3, commit: commit('d', [], 'chore: initial commit'), lane: 0, colorIdx: 2, laneCount: 1, edges: [] },
];
const DATA = { ...fixtures, graphRows: ROWS };

/**
 * The checked-out branch's lane wears the user's primary colour (ad hoc) —
 * light and dark, then again after the accent is changed live. Needs a real
 * browser: the colour is resolved from `--primary` by the browser and the lanes
 * are SVG paint. Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/adhoc-graph-head-lane';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

for (const theme of ['light', 'dark'] as const) {
  test(`head lane in primary, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installMockBridge(page, DATA);
    await page.goto('/');
    await setTheme(page, theme);
    await setReducedMotion(page);
    await expect(page.getByText('start the branch').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: shotPath(OUT, `default-${theme}-${VARIANT}`) });

    // Live change of the accent, as Settings > Appearance writes it.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--primary', '330 80% 55%');
      document.documentElement.setAttribute('data-accent', 'custom');
      document.documentElement.style.setProperty('--accent-h', '330');
      document.documentElement.style.setProperty('--accent-s', '80');
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: shotPath(OUT, `pink-${theme}-${VARIANT}`) });
  });
}
