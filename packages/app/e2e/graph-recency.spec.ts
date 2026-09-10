import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * A commit fading out of "just landed" across five tiers.
 *
 * `graph-row.test.ts` pins the tier boundaries and `graph-row-highlight.test.tsx`
 * pins which classes each tier puts on the row; neither can say whether the
 * stylesheet then paints anything, because every rule here resolves
 * `--lane-h/s/l` at computed-style time and jsdom loads no stylesheet at all.
 * That is what this file is for — plus the shot at the end, which is the only
 * thing that can say the five tiers actually look different from one another.
 */
const OUT = '../../docs/screenshots/adhoc-commit-recency-tiers';

const sha = (i: number) => `${i}`.padStart(40, 'a');

/**
 * Ages chosen mid-band, not on a boundary: the ticker in `graph-view.tsx`
 * re-reads the clock every 5 seconds, so a commit parked at exactly a
 * boundary would change tier partway through the run.
 */
const TIERS = [
  { key: 'fresh', secondsAgo: 90, subject: 'feat(graph): under six minutes — fresh' },
  { key: 'recent', secondsAgo: 480, subject: 'feat(graph): eight minutes — recent' },
  { key: 'fading', secondsAgo: 840, subject: 'fix(graph): fourteen minutes — fading' },
  { key: 'muted', secondsAgo: 1440, subject: 'refactor(graph): twenty-four minutes — muted' },
  { key: 'normal', secondsAgo: 7200, subject: 'chore: two hours — normal' },
] as const;

/**
 * Every tier gets its own lane *position*, so the shot lays them out one per
 * row. Hue (`colorIdx`) is separate: 'muted' deliberately reuses 'fresh'\'s so
 * a test can compare the muted tint against the same hue at full intensity —
 * every other tier gets its own, so the effect still shows it names the
 * branch rather than being one shared highlight colour.
 */
const COLOR_IDX: Record<(typeof TIERS)[number]['key'], number> = {
  fresh: 0,
  recent: 1,
  fading: 2,
  muted: 0,
  normal: 3,
};

const graphRows = () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return TIERS.map((tier, i) => ({
    row: i,
    lane: i,
    colorIdx: COLOR_IDX[tier.key],
    laneCount: TIERS.length,
    edges: [{ fromLane: i, toLane: i, type: 'straight', colorIdx: COLOR_IDX[tier.key] }],
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

const [FRESH, RECENT, FADING, MUTED, NORMAL] = TIERS;

test.describe('commit recency decay', () => {
  test('glows the row while the row-glow layer is on, and no longer', async ({ page }) => {
    await openGraph(page);

    // Only 'fresh' and 'recent' carry the row/border glow now — 'fading' and
    // 'muted' both keep the lane-coloured text pulse but lose this layer.
    for (const tier of [FRESH, RECENT]) {
      const shadow = await rowFor(page, tier.subject).evaluate(
        (el) => getComputedStyle(el).boxShadow,
      );
      expect(shadow).toContain('inset');
    }
    for (const tier of [FADING, MUTED, NORMAL]) {
      const shadow = await rowFor(page, tier.subject).evaluate(
        (el) => getComputedStyle(el).boxShadow,
      );
      expect(shadow === 'none' || shadow === '').toBe(true);
    }
  });

  test('keeps the lane tint through fading, mutes it further, then drops it at normal', async ({
    page,
  }) => {
    await openGraph(page);

    // Subject, date and sha — `git-graph` renders no Author column.
    const inkColors = async (subject: string) => {
      const ink = rowFor(page, subject).locator('.graph-row-ink');
      await expect(ink).toHaveCount(3);
      return ink.evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    };

    const normal = await inkColors(NORMAL.subject);
    const fresh = await inkColors(FRESH.subject);
    const recent = await inkColors(RECENT.subject);
    const fading = await inkColors(FADING.subject);
    const muted = await inkColors(MUTED.subject);

    // Each tier tints its own subject, date and sha together (the three cells
    // move as one), and every tier still inside the window reads as tinted
    // rather than as `normal`'s plain ink.
    for (const tinted of [fresh, recent, fading, muted]) {
      expect(new Set(tinted).size).toBe(1);
      expect(tinted[0]).not.toBe(normal[0]);
    }

    // 'fading' is the tier the old four-step decay got wrong: it used to drop
    // the lane tint entirely here. 'muted' shares 'fresh'\'s lane hue (see
    // `COLOR_IDX`), so the fix — full intensity through 'fading', attenuated
    // rather than dropped at 'muted' — shows up as one colour surviving
    // unchanged and the other, same-hue colour coming out different.
    expect(muted[0]).not.toBe(fresh[0]);
  });

  test('takes each tint from that row own lane, not one shared highlight colour', async ({
    page,
  }) => {
    await openGraph(page);

    // Lane 0 is red-led and lane 1 is emerald in the vivid palette, so two
    // tinted rows landing on the same colour would mean the rule reads
    // something other than `--lane-h`.
    const rgb = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
    const [fresh, recent] = await Promise.all(
      [FRESH, RECENT].map((tier) =>
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

  test('screenshot the five tiers', async ({ page }) => {
    await openGraph(page);
    // Let the entrance fade settle, or the shot catches the graph mid-fade.
    await page.waitForTimeout(400);
    // `animations: 'disabled'` rewinds every animation to its first frame,
    // which for these is the resting end of each pulse — the trough.
    if (process.env.MSTUDIO_SHOTS) {
      await page.screenshot({ path: `${OUT}/tiers-trough.png`, animations: 'disabled' });
    }

    /*
      And the peak, which is the half of the pulse worth looking at. Parked
      rather than caught: a negative delay equal to half the 2s period puts
      every pulse on its 50% keyframe, and `paused` holds it there, so the shot
      is the same picture every run instead of whenever the timeout landed.
    */
    await page.addStyleTag({
      content: `
        .commit-text-pulse, .commit-text-pulse-muted, .commit-row-glow {
          animation-delay: -1s !important;
          animation-play-state: paused !important;
        }
        .commit-row-shimmer::after { animation-play-state: paused !important; }
      `,
    });
    if (process.env.MSTUDIO_SHOTS) {
      await page.screenshot({ path: `${OUT}/tiers-peak.png` });
    }
  });
});
