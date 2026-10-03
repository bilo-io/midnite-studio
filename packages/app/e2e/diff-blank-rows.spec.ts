import { expect, test, type Locator, type Page } from '@playwright/test';

import { COMMIT_SHA, fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Blank bands in the diff viewer after scrolling.
 *
 * Needs a real browser: real layout, real scrolling and `elementFromPoint` hit
 * testing. jsdom has no geometry, so a virtualizer computing a wrong window
 * offset is invisible there (the vitest twin only proves rows are all mounted).
 *
 * Two scenarios: (a) the commit's "all changes" stack of accordions, many files
 * of varied length, scrolled in steps with an accordion collapsed and re-opened
 * mid-scroll; (b) one very long file with hunk separators, scrolled, then the
 * layout switched and the file switched away and back.
 *
 * The assertion at every step: probe several y positions down the scroller; each
 * must land on a diff row, hunk separator or file header — never on empty space.
 */

const SHA = COMMIT_SHA;

function makeDiff(path: string, lines: number) {
  const half = Math.ceil(lines / 2);
  const hunk = (start: number, count: number) => ({
    oldStart: start,
    oldLines: count,
    newStart: start,
    newLines: count,
    heading: '@@',
    lines: Array.from({ length: count }, (_, i) => ({
      kind: i % 5 === 0 ? 'add' : 'ctx',
      oldNo: i % 5 === 0 ? null : start + i,
      newNo: start + i,
      text: `${path} line ${start + i} const value = ${i};`,
      ranges: [],
      noNewline: false,
    })),
  });
  return {
    path,
    oldPath: null,
    change: 'modified',
    binary: false,
    oldMode: null,
    newMode: null,
    // A second hunk far below the first, so a "hidden lines" separator sits between.
    hunks: [hunk(1, half), hunk(half + 900, lines - half)],
    insertions: lines,
    deletions: 0,
    contextLines: 3,
    combined: false,
    truncated: false,
    droppedLines: 0,
  };
}

const LENGTHS = [6, 14, 40, 9, 220, 18, 75, 600, 12, 30, 1500, 8];
const files = LENGTHS.map((n, i) => ({
  path: `src/f${String(i).padStart(2, '0')}.ts`,
  oldPath: null,
  insertions: n,
  deletions: 0,
}));

async function open(page: Page, fileList: typeof files, lengths: number[]): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const diffs: Record<string, unknown> = { ...fixtures.diffs };
  fileList.forEach((f, i) => {
    diffs[`${SHA}:${f.path}`] = makeDiff(f.path, lengths[i]!);
  });
  await installMockBridge(page, {
    ...fixtures,
    commitDetails: {
      ...fixtures.commitDetails,
      [SHA]: { ...(fixtures.commitDetails[SHA] as object), files: fileList },
    },
    diffs,
  });
  await page.goto('/');
  const row = page.getByText('feat(phase-11): package, install and run from /Applications');
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('commit-files').filter({ visible: true })).toBeVisible();
}

/** Every probed point inside the scroller must hit content, not blank space. */
async function expectNoBlankBand(scroller: Locator): Promise<void> {
  const blanks = await scroller.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const out: number[] = [];
    // Probe a column inside the code area, well right of the gutter.
    const x = r.left + Math.min(r.width - 20, 400);
    for (let k = 1; k <= 9; k++) {
      const y = r.top + (r.height * k) / 10;
      const hit = document.elementFromPoint(x, y);
      const ok = hit?.closest(
        '[data-line-kind], [data-testid="diff-hunk"], [data-testid="diff-cell-left-empty"], [data-testid="diff-cell-right-empty"], header, p',
      );
      if (!ok) out.push(Math.round(y));
    }
    return out;
  });
  expect(blanks, 'y positions that landed on blank space').toEqual([]);
}

async function scrollTo(scroller: Locator, top: number): Promise<void> {
  await scroller.evaluate((el, t) => {
    el.scrollTop = t;
  }, top);
  // two frames: let the virtualizer / measurement settle
  await scroller.page().evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

test('stacked accordions never leave a blank band while scrolling and collapsing', async ({
  page,
}) => {
  await open(page, files, LENGTHS);
  await page
    .getByRole('button', { name: /Expand all files/ })
    .filter({ visible: true })
    .first()
    .click();
  // The accordions' scroller: the parent of the file sections.
  const scroller = page.locator('section[class*="border-border/60"]:has(> header button[aria-expanded])').first().locator("xpath=ancestor::div[contains(@class,'overflow-y-auto')][1]");
  await expect(scroller.locator('[data-line-kind]').first()).toBeVisible();

  const total = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(total).toBeGreaterThan(3000);

  for (let top = 0; top <= total; top += Math.round(total / 14)) {
    await scrollTo(scroller, top);
    await expectNoBlankBand(scroller);
  }

  // Collapse an accordion above the viewport, mid-scroll, then re-open it.
  await scrollTo(scroller, Math.round(total / 2));
  const toggle = scroller.getByRole('button', { name: /src\/f04\.ts/ });
  await toggle.evaluate((b) => (b as HTMLElement).click());
  await expectNoBlankBand(scroller);
  const total2 = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  for (let top = total2; top >= 0; top -= Math.round(total2 / 10)) {
    await scrollTo(scroller, top);
    await expectNoBlankBand(scroller);
  }
  await scroller.getByRole('button', { name: /src\/f04\.ts/ }).evaluate((b) => (b as HTMLElement).click());
  await scrollTo(scroller, Math.round(total / 3));
  await expectNoBlankBand(scroller);
});

test('one very long file stays filled through scroll, layout and file switches', async ({
  page,
}) => {
  const lengths = [3000, 60];
  const two = files.slice(0, 2);
  await open(page, two, lengths);
  const list = page.getByTestId('commit-files').filter({ visible: true });
  await list.getByRole('button', { name: /src\/f00\.ts/ }).click();
  const view = page.getByTestId('diff-view').filter({ visible: true });
  await expect(view).toBeVisible();
  const scroller = view.locator('div.overflow-auto').first();
  await expect(scroller.locator('[data-line-kind]').first()).toBeVisible();

  const total = await scroller.evaluate((el) => el.scrollHeight - el.clientHeight);
  for (let top = 0; top <= total; top += Math.round(total / 25)) {
    await scrollTo(scroller, top);
    await expectNoBlankBand(scroller);
  }

  await page.getByRole('button', { name: 'Switch to side-by-side diff' }).click();
  await expect(page.getByRole('button', { name: 'Switch to unified diff' })).toBeVisible();
  await scrollTo(scroller, Math.round(total / 2));
  await expectNoBlankBand(scroller);

  await list.getByRole('button', { name: /src\/f01\.ts/ }).click();
  await expectNoBlankBand(scroller);
  await list.getByRole('button', { name: /src\/f00\.ts/ }).click();
  await scrollTo(scroller, Math.round(total * 0.8));
  await expectNoBlankBand(scroller);
  await page.getByRole('button', { name: 'Switch to unified diff' }).click();
  await scrollTo(scroller, Math.round(total * 0.4));
  await expectNoBlankBand(scroller);
});
