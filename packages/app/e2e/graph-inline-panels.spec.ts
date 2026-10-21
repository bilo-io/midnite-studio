import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The git graph's expand-in-place panels, where only a real browser can answer.
 *
 * **Browser capabilities this needs:** real layout (`getBoundingClientRect`,
 * all zeros under jsdom) and the Web Animations API (`Element.animate`, absent
 * from jsdom). The claims are geometric: the panel's height animates rather
 * than jumping, the virtualizer's variable-height slot pushes the rows below
 * it down by exactly the panel's height on every frame of that animation and
 * closes back up after it, the lanes running under the panel line up with the
 * lanes of the row below, and a row scrolled far out of the virtual window and
 * back keeps both its expansion and its geometry without replaying its
 * entrance.
 *
 * Which panel is open, one-at-a-time, the Escape rules and committing from the
 * panel are vitest (`graph-inline.bridge.test.tsx`); the shared parts in both
 * hosts are `working-tree-changes.bridge.test.tsx`.
 */

const sha = (i: number) => i.toString(16).padStart(7, '0').padEnd(40, 'b');

/** Two lanes side by side all the way down, so there is something to continue. */
const ROWS = Array.from({ length: 120 }, (_, i) => ({
  row: i,
  commit: {
    sha: sha(i + 1),
    parents: [sha(i + 2)],
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    authorDate: 1_787_000_000 - i * 60,
    committerDate: 1_787_000_000 - i * 60,
    subject: `inline commit ${i + 1}`,
    refs: [],
  },
  lane: 0,
  colorIdx: 0,
  edges: [
    { fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 },
    { fromLane: 1, toLane: 1, type: 'straight', colorIdx: 1 },
  ],
  laneCount: 2,
}));

const DATA: MockFixtures = {
  ...fixtures,
  graphRows: ROWS,
  commitDetails: {
    [sha(3)]: {
      sha: sha(3),
      parents: [sha(4)],
      subject: 'inline commit 3',
      body: 'inline commit 3',
      author: { name: 'Ada Lovelace', email: 'ada@example.com', date: 1_787_000_000 },
      committer: { name: 'Ada Lovelace', email: 'ada@example.com', date: 1_787_000_000 },
      files: [{ path: 'src/one.ts', oldPath: null, insertions: 1, deletions: 0 }],
    },
  },
};

const row = (page: Page, n: number) =>
  page.getByRole('row').filter({ has: page.getByText(`inline commit ${n}`, { exact: true }) });
const expander = (page: Page) => page.locator('[data-graph-inline-state]');

async function openGraph(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(row(page, 3)).toBeVisible();
}

/**
 * Records the expander's height on every animation frame for `ms`, armed
 * BEFORE the gesture that starts the animation — a 200ms animation is over
 * before a round trip that starts sampling after the click would begin.
 */
const armSampler = (page: Page, ms: number) =>
  page.evaluate((duration) => {
    const w = window as unknown as { __inlineHeights: Promise<number[]> };
    w.__inlineHeights = new Promise<number[]>((resolve) => {
      const heights: number[] = [];
      const start = performance.now();
      const tick = () => {
        const el = document.querySelector('[data-graph-inline-state]');
        heights.push(el ? el.getBoundingClientRect().height : -1);
        if (performance.now() - start < duration) requestAnimationFrame(tick);
        else resolve(heights);
      };
      requestAnimationFrame(tick);
    });
  }, ms);
const sampled = (page: Page) =>
  page.evaluate(() => (window as unknown as { __inlineHeights: Promise<number[]> }).__inlineHeights);

/** The x of every lane line inside `selector`'s first match, rounded to the pixel. */
const laneXs = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((root) =>
    [...root.querySelectorAll('line')]
      .map((line) => {
        const box = line.getBoundingClientRect();
        return Math.round(box.left + box.width / 2);
      })
      .sort((a, b) => a - b),
  );

test('the panel animates open and shut, the rows below follow it, and the lanes run under it', async ({
  page,
}) => {
  await openGraph(page);
  const rowTopBefore = (await row(page, 4).boundingBox())!.y;

  await armSampler(page, 600);
  await row(page, 3).click();
  const opening = (await sampled(page)).filter((h) => h >= 0);
  const open = opening.at(-1)!;
  // Animated: at least one frame strictly between shut and open, and it only grows.
  expect(open).toBeGreaterThan(200);
  expect(opening.some((h) => h > 10 && h < open - 10)).toBe(true);
  for (let i = 1; i < opening.length; i++) expect(opening[i]!).toBeGreaterThanOrEqual(opening[i - 1]! - 0.5);

  // The virtualizer measured the slot: the next row starts exactly where it ends.
  const slot = (await expander(page).boundingBox())!;
  await expect
    .poll(async () => Math.round((await row(page, 4).boundingBox())!.y))
    .toBe(Math.round(slot.y + slot.height));

  // The lanes under the card sit exactly over the next row's lanes — at the
  // full width, and after the window narrows enough that the BRANCH / TAG
  // column gives up width and the CI column hides (the graph's own container
  // queries), because the strip under the card shrinks cell for cell with the
  // rows only if it mirrors their whole grid.
  for (const width of [1440, 1280, 760]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () => {
        const under = await laneXs(page, '[data-graph-lane-continuation]');
        const below = await row(page, 4).evaluate((el) =>
          [...el.querySelectorAll('svg line')]
            .map((line) => {
              const box = line.getBoundingClientRect();
              return Math.round(box.left + box.width / 2);
            })
            .filter((x, i, all) => all.indexOf(x) === i),
        );
        return under.length === 2 && under.every((x) => below.includes(x));
      }, { message: `lanes under the panel line up at ${width}px` })
      .toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect
    .poll(async () => Math.round((await row(page, 4).boundingBox())!.y))
    .toBe(Math.round((await expander(page).boundingBox())!.y + (await expander(page).boundingBox())!.height));

  // Escape collapses it, animated, and the rows close back up.
  await armSampler(page, 400);
  await page.keyboard.press('Escape');
  const closing = (await sampled(page)).filter((h) => h >= 0);
  expect(closing.some((h) => h > 10 && h < open - 10)).toBe(true);
  await expect(expander(page)).toHaveCount(0);
  await expect.poll(async () => Math.round((await row(page, 4).boundingBox())!.y)).toBe(Math.round(rowTopBefore));
});

test('a row scrolled far away and back keeps its panel, settled, at the same geometry', async ({ page }) => {
  await openGraph(page);
  await row(page, 3).click();
  await page.waitForTimeout(400);
  const settled = (await expander(page).boundingBox())!.height;

  const grid = page.getByRole('grid');
  await grid.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(row(page, 3)).toHaveCount(0);
  await expect(row(page, 120)).toBeVisible();

  await grid.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(row(page, 3)).toBeVisible();
  // No entrance replay: the very first frames already have the full height.
  await armSampler(page, 80);
  const again = (await sampled(page)).filter((h) => h >= 0);
  expect(again.length).toBeGreaterThan(0);
  for (const h of again) expect(Math.abs(h - settled)).toBeLessThan(1);
  const slot = (await expander(page).boundingBox())!;
  expect(Math.round((await row(page, 4).boundingBox())!.y)).toBe(Math.round(slot.y + slot.height));
});
