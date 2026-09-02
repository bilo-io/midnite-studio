import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Selecting a commit tints the row, the text and the whole branch in the lane's
 * own colour.
 *
 * The unit test (`graph-row-highlight.test.tsx`) pins which elements carry the
 * classes; only a real browser can say whether the stylesheet then paints them,
 * because every one of these rules resolves `--lane-h/s/l` at computed-style
 * time and jsdom loads no stylesheet at all.
 */
const AUTHORS = [
  { name: 'Ada Lovelace', email: 'ada@example.com' },
  { name: 'Grace Hopper', email: 'grace@example.com' },
];

const sha = (i: number) => `${i}`.padStart(40, 'a');

const commit = (i: number, parents: string[], subject: string) => {
  const author = AUTHORS[i % AUTHORS.length]!;
  return {
    sha: sha(i),
    parents,
    authorName: author.name,
    authorEmail: author.email,
    authorDate: 1_787_000_000 - i * 3600,
    committerDate: 1_787_000_000 - i * 3600,
    subject,
    refs: [],
  };
};

/**
 * Two lanes that run alongside each other for several rows.
 *
 * The highlight's whole claim is that it follows the BRANCH, so the fixture has
 * to contain rows that share the selection's lane and rows that do not — a
 * single-lane history would light up entirely whatever the rule was.
 */
const GRAPH_ROWS = [
  {
    row: 0,
    lane: 0,
    colorIdx: 0,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 },
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 },
      { fromLane: 0, toLane: 1, type: 'merge', colorIdx: 1 },
    ],
    commit: commit(0, [sha(1), sha(2)], 'feat(graph): merge the feature branch'),
  },
  {
    row: 1,
    lane: 1,
    colorIdx: 1,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 },
      { fromLane: 1, toLane: 1, type: 'branch', colorIdx: 1 },
      { fromLane: 1, toLane: 1, type: 'merge', colorIdx: 1 },
    ],
    commit: commit(1, [sha(2)], 'feat(graph): resizable columns'),
  },
  {
    row: 2,
    lane: 1,
    colorIdx: 1,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 },
      { fromLane: 1, toLane: 1, type: 'branch', colorIdx: 1 },
      { fromLane: 1, toLane: 1, type: 'merge', colorIdx: 1 },
    ],
    commit: commit(2, [sha(3)], 'fix(graph): lane recycling off by one'),
  },
  {
    row: 3,
    lane: 0,
    colorIdx: 0,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 },
      { fromLane: 1, toLane: 0, type: 'branch', colorIdx: 1 },
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 },
    ],
    commit: commit(3, [sha(4)], 'chore: the commit both lanes came from'),
  },
  {
    row: 4,
    lane: 0,
    colorIdx: 0,
    laneCount: 1,
    edges: [{ fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 }],
    commit: commit(4, [], 'initial commit'),
  },
];

const REFS = [
  {
    name: 'main',
    fullName: 'refs/heads/main',
    kind: 'localBranch',
    sha: sha(0),
    upstream: { name: 'origin/main', ahead: 0, behind: 0, gone: false },
    isHead: true,
    worktreePath: null,
  },
  {
    name: 'feat/lane-highlight',
    fullName: 'refs/heads/feat/lane-highlight',
    kind: 'localBranch',
    sha: sha(1),
    upstream: null,
    isHead: false,
    worktreePath: null,
  },
];

const selectionFixtures: MockFixtures = { ...fixtures, graphRows: GRAPH_ROWS, refs: REFS };

async function openGraph(page: Page): Promise<void> {
  // Never the network: a Gravatar round trip makes the suite fail on a train
  // and paints a different picture every run.
  await page.route('**gravatar.com/**', (route) => route.fulfill({ status: 404, body: '' }));
  await installMockBridge(page, selectionFixtures);
  await page.goto('/graph');
  const repoButton = page
    .locator('aside[aria-label="Repositories"]')
    .getByRole('button', { name: 'midnite-studio', exact: true });
  if (await repoButton.isVisible()) {
    await repoButton.click();
  }
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

const rowFor = (page: Page, subject: string) =>
  page.locator('[role="row"]').filter({ hasText: subject }).first();

/** A computed colour as its three numbers, so a comparison is not string-shaped. */
const rgb = (value: string): number[] =>
  (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);

test.describe('commit selection colour', () => {
  test('tints the selected row with its own lane hue, not the accent', async ({ page }) => {
    await openGraph(page);

    const row = rowFor(page, 'feat(graph): resizable columns');
    const before = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Nothing selected: no fill at all, only the hover rule that needs a pointer.
    expect(rgb(before).every((c) => c === 0)).toBe(true);

    await row.click();
    await expect(row).toHaveAttribute('aria-selected', 'true');

    const after = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(after).not.toBe(before);

    /*
      The lane colour, faithfully. Lane 1 is the emerald `hsl(144 72% 45%)`, so
      whatever the tint composites to, its green channel has to lead — an accent
      fill (a neutral, or the settings hue) could not.
    */
    const [r, g, b] = rgb(
      await row.evaluate((el) => {
        const [h, s, l] = ['--lane-h', '--lane-s', '--lane-l'].map((name) =>
          getComputedStyle(el).getPropertyValue(name).trim(),
        );
        const probe = document.createElement('span');
        probe.style.color = `hsl(${h} ${s} ${l})`;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      }),
    );
    expect(g).toBeGreaterThan(r!);
    expect(g).toBeGreaterThan(b!);
  });

  test('recolours the subject, date and sha to the branch', async ({ page }) => {
    await openGraph(page);

    const row = rowFor(page, 'feat(graph): resizable columns');
    const ink = row.locator('.graph-row-ink');
    await expect(ink).toHaveCount(3);

    const muted = await ink.first().evaluate((el) => getComputedStyle(el).color);
    await row.click();
    const tinted = await ink.first().evaluate((el) => getComputedStyle(el).color);
    expect(tinted).not.toBe(muted);

    // All three move together — the sha is the one most easily left behind,
    // since it carries `font-mono` and `text-muted-foreground` of its own.
    const colors = await ink.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).color),
    );
    expect(new Set(colors).size).toBe(1);
    expect(colors[0]).toBe(tinted);
  });

  test('haloes every row on the branch, and only that branch', async ({ page }) => {
    await openGraph(page);

    await expect(page.locator('[data-graph-glow]')).toHaveCount(0);

    // Row 1 sits on lane 1, and so does row 2.
    await rowFor(page, 'feat(graph): resizable columns').click();

    const onLane = rowFor(page, 'fix(graph): lane recycling off by one');
    await expect(onLane.locator('[data-graph-glow] circle')).toHaveCount(1);
    await expect(onLane.locator('[data-graph-rail]')).toHaveClass(/graph-rail-glow/);

    // The initial commit is lane 0 alone: no lane-1 edge passes through it, so
    // its halo group is empty and its rail stays quiet.
    const offLane = rowFor(page, 'initial commit');
    await expect(offLane.locator('[data-graph-glow] circle')).toHaveCount(0);
    await expect(offLane.locator('[data-graph-glow] line, [data-graph-glow] path')).toHaveCount(0);
    await expect(offLane.locator('[data-graph-rail]')).not.toHaveClass(/graph-rail-glow/);

    // Selecting across to lane 0 moves the whole halo with it.
    await rowFor(page, 'initial commit').click();
    await expect(offLane.locator('[data-graph-glow] circle')).toHaveCount(1);
    await expect(onLane.locator('[data-graph-glow] circle')).toHaveCount(0);
  });
});

/**
 * The PR's before/after PNGs, from the same mocked bridge as the assertions
 * above. `MSTUDIO_SHOTS=1` only — the normal suite stays fast and does not
 * rewrite committed images on every run.
 */
const OUT = '../../docs/screenshots/adhoc-graph-lane-highlight';

test.describe('screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1');

  test('graph, nothing selected and a commit selected', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    await openGraph(page);
    await page.waitForTimeout(900);

    await page.screenshot({ path: `${OUT}/unselected.png` });

    await rowFor(page, 'feat(graph): resizable columns').click();
    // Mid-pulse, so the halo is at something like its brightest.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/selected.png` });
  });

  /*
    Dark too, because `--lane-ink-l` is the one part of this that is NOT the
    lane's own colour: the palette is tuned for a dark ground, so the selected
    row's text is darkened on white and lifted on black. A light-only shot
    would prove exactly half of it.
  */
  test('the same selection on a dark ground', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await openGraph(page);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(900);

    await rowFor(page, 'feat(graph): resizable columns').click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/selected-dark.png` });
  });
});
