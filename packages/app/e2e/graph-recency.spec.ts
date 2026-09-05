import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * A commit fading out of "just landed" across four tiers.
 *
 * `graph-row.test.ts` pins the tier boundaries and `graph-row-highlight.test.tsx`
 * pins which classes each tier puts on the row; neither can say whether the
 * stylesheet then paints anything, because every rule here resolves
 * `--lane-h/s/l` at computed-style time and jsdom loads no stylesheet at all.
 * That is what this file is for — plus the shot at the end, which is the only
 * thing that can say the four tiers actually look different from one another.
 */
const OUT = '../../docs/screenshots/adhoc-commit-recency-tiers';

const sha = (i: number) => `${i}`.padStart(40, 'a');

/**
 * Ages chosen mid-band, not on a boundary: the ticker in `graph-view.tsx`
 * re-reads the clock every 5 seconds, so a commit parked at exactly 120s would
 * change tier partway through the run.
 */
const TIERS = [
  { key: 'fresh', secondsAgo: 45, subject: 'feat(graph): under two minutes — fresh' },
  { key: 'recent', secondsAgo: 210, subject: 'feat(graph): three minutes — recent' },
  { key: 'fading', secondsAgo: 420, subject: 'fix(graph): seven minutes — fading' },
  { key: 'normal', secondsAgo: 7200, subject: 'chore: two hours — normal' },
] as const;

/**
 * One lane per row, so each tier gets a different hue and the shot shows the
 * effect naming the branch rather than one generic "new commit" colour.
 */
const graphRows = () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return TIERS.map((tier, i) => ({
    row: i,
    lane: i,
    colorIdx: i,
    laneCount: TIERS.length,
    edges: [{ fromLane: i, toLane: i, type: 'straight', colorIdx: i }],
    commit: {
      sha: sha(i),
      parents: i + 1 < TIERS.length ? [sha(i + 1)] : [],
      authorName: 'Ada Lovelace',
      authorEmail: 'ada@example.com',
      authorDate: nowSeconds - tier.secondsAgo,
      committerDate: nowSeconds - tier.secondsAgo,
      subject: tier.subject,
      refs: [],
    },
  }));
};

async function openGraph(page: Page): Promise<void> {
  // Never the network: a Gravatar round trip makes the suite fail on a train
  // and paints a different picture every run.
  await page.route('**gravatar.com/**', (route) => route.fulfill({ status: 404, body: '' }));
  const recencyFixtures: MockFixtures = { ...fixtures, graphRows: graphRows() };
  await installMockBridge(page, recencyFixtures);
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

test.describe('commit recency decay', () => {
  test('glows the row for every tier inside the window, and no longer', async ({ page }) => {
    await openGraph(page);

    for (const tier of TIERS) {
      const row = rowFor(page, tier.subject);
      const shadow = await row.evaluate((el) => getComputedStyle(el).boxShadow);
      if (tier.key === 'normal') {
        expect(shadow === 'none' || shadow === '').toBe(true);
      } else {
        expect(shadow).toContain('inset');
      }
    }
  });

  test('tints subject, date and sha together for the first two tiers, then returns them', async ({
    page,
  }) => {
    await openGraph(page);

    // Subject, date and sha — `git-graph` renders no Author column.
    const inkColors = async (subject: string) => {
      const ink = rowFor(page, subject).locator('.graph-row-ink');
      await expect(ink).toHaveCount(3);
      return ink.evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    };

    const normal = await inkColors(TIERS[3]!.subject);
    // `'fading'` is the tier whose whole point is that the ink came back: it
    // keeps the glow, so an assertion on the class alone would not catch a rule
    // that also left the colour behind.
    expect(await inkColors(TIERS[2]!.subject)).toEqual(normal);

    for (const tier of [TIERS[0]!, TIERS[1]!]) {
      const tinted = await inkColors(tier.subject);
      // All three move together — the sha is the one most easily left behind,
      // since it carries `font-mono` and `text-muted-foreground` of its own.
      expect(new Set(tinted).size).toBe(1);
      expect(tinted[0]).not.toBe(normal[0]);
    }
  });

  test('takes each tint from that row own lane, not one shared highlight colour', async ({
    page,
  }) => {
    await openGraph(page);

    // Lane 0 is red-led and lane 1 is emerald in the vivid palette, so two
    // tinted rows landing on the same colour would mean the rule reads
    // something other than `--lane-h`.
    const [fresh, recent] = await Promise.all(
      [TIERS[0]!, TIERS[1]!].map((tier) =>
        rowFor(page, tier.subject)
          .locator('.graph-row-ink')
          .last()
          .evaluate((el) => getComputedStyle(el).color),
      ),
    );
    expect(fresh).not.toBe(recent);

    const [r, g, b] = rgb(recent!);
    expect(g).toBeGreaterThan(r!);
    expect(g).toBeGreaterThan(b!);
  });

  test('screenshot the four tiers', async ({ page }) => {
    await openGraph(page);
    // Let the entrance fade settle, or the shot catches the graph mid-fade.
    await page.waitForTimeout(400);
    // `animations: 'disabled'` rewinds every animation to its first frame,
    // which for these is the resting end of each pulse — the trough.
    await page.screenshot({ path: `${OUT}/tiers-trough.png`, animations: 'disabled' });

    /*
      And the peak, which is the half of the pulse worth looking at. Parked
      rather than caught: a negative delay equal to half the 2s period puts
      every pulse on its 50% keyframe, and `paused` holds it there, so the shot
      is the same picture every run instead of whenever the timeout landed.
    */
    await page.addStyleTag({
      content: `
        .commit-text-pulse, .commit-row-glow {
          animation-delay: -1s !important;
          animation-play-state: paused !important;
        }
        .commit-row-shimmer::after { animation-play-state: paused !important; }
      `,
    });
    await page.screenshot({ path: `${OUT}/tiers-peak.png` });
  });
});
