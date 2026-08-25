import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 8's drag gestures, re-verified after Phase 14 moved the ref chips.
 *
 * The chips used to sit beside the commit subject; they now live in a dedicated
 * BRANCH / TAG column. Nothing about `useRefDnd` changed, which is exactly why
 * this needed a test: the wiring is invisible from the markup, so a relocation
 * that dropped the drop-target ref, or nested the chips inside something that
 * swallows pointer events, would look entirely normal while silently costing
 * the app its merge/rebase/cherry-pick gestures.
 *
 * Every assertion here is on the gesture reaching the right OPERATION, not just
 * on a menu appearing — see the op recorder in `mock-bridge.ts`.
 */
const sha = (i: number) => `${i}`.padStart(40, 'a');

const commit = (i: number, parents: string[], subject: string) => ({
  sha: sha(i),
  parents,
  authorName: 'Ada Lovelace',
  authorEmail: 'ada@example.com',
  authorDate: 1_787_000_000 - i * 3600,
  committerDate: 1_787_000_000 - i * 3600,
  subject,
  refs: [],
});

/**
 * A linear history where every drop target has ref-less rows around it.
 *
 * The spacing is load-bearing, not decoration. dnd-kit's default collision
 * detection is `rectIntersection`, and with a `<DragOverlay>` the rect it
 * collides is the OVERLAY's — a pill sized by the text it carries, not the
 * element the drag started from. Put two chips on adjacent rows and a drop
 * aimed at one of them can be scored onto the other, which reads as a broken
 * gesture but is really an ambiguous one. `main` therefore sits at the top with
 * two empty rows beneath it, and the commit dragged in the cherry-pick case
 * starts five rows away.
 *
 * Refs bind to rows by sha: `main` on row 0, `feature/drag-me` on row 3, the
 * tag on row 4.
 */
const GRAPH_ROWS = [0, 1, 2, 3, 4, 5].map((i) => ({
  row: i,
  lane: 0,
  colorIdx: 0,
  laneCount: 1,
  edges: [{ fromLane: 0, toLane: 0, type: i === 5 ? 'branch' : 'straight', colorIdx: 0 }],
  commit: commit(i, i === 5 ? [] : [sha(i + 1)], `commit number ${i}`),
}));

/** `main` is HEAD — the mock bridge reports `branch.head === 'main'`. */
const REFS = [
  {
    name: 'main',
    fullName: 'refs/heads/main',
    kind: 'localBranch',
    sha: sha(0),
    upstream: null,
    isHead: true,
    worktreePath: null,
  },
  {
    name: 'feature/drag-me',
    fullName: 'refs/heads/feature/drag-me',
    kind: 'localBranch',
    sha: sha(3),
    upstream: null,
    isHead: false,
    worktreePath: null,
  },
  {
    name: 'v1.0.0',
    fullName: 'refs/tags/v1.0.0',
    kind: 'tag',
    sha: sha(4),
    upstream: null,
    isHead: false,
    worktreePath: null,
  },
];

const dragFixtures: MockFixtures = { ...fixtures, graphRows: GRAPH_ROWS, refs: REFS };

async function openGraph(page: Page): Promise<void> {
  await installMockBridge(page, dragFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/** A chip, scoped to the graph rows so the sidebar's own refs cannot match. */
const chip = (page: Page, fullName: string): Locator =>
  page.locator('[role="row"]').getByTitle(fullName, { exact: true });

/**
 * The lane gutter of the row with `subject` — the commit's drag handle.
 *
 * Found by subject rather than by ref, because a chip carries its own `<svg>`
 * icon: on a row that has one, the first svg in the row is the chip's tag or
 * HEAD glyph, and a drag from there is a *ref* drag wearing a commit's clothes.
 * Rows 0, 3 and 4 hold the refs; the rest deliberately hold none.
 */
const nodeOfRow = (page: Page, subject: string): Locator =>
  page.locator('[role="row"]').filter({ hasText: subject }).locator('svg').first();

const centre = async (target: Locator) => {
  const box = await target.boundingBox();
  if (!box) throw new Error('target has no bounding box — it is not laid out');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/**
 * Drags `from` onto `to` with a real pointer.
 *
 * Two moves, not one. `PointerSensor` carries a 6px activation distance so that
 * a click on a badge stays a click, and it only begins tracking once that
 * threshold is crossed — a single jump to the target can arrive before the drag
 * has started, which reads as "drag and drop is broken" when in fact it is the
 * test that never dragged.
 */
async function dragOnto(page: Page, from: Locator, to: Locator): Promise<void> {
  const start = await centre(from);
  const end = await centre(to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();

  /*
    Pause before anything clicks — dnd-kit swallows the click that trails a drag.

    On activation `AbstractPointerSensor` adds a document-level CAPTURE listener
    that `stopPropagation()`s `click`, and its teardown removes it only after a
    50ms timeout. That is there to stop a drag being read as a click on whatever
    was underneath, and no human ever meets it: releasing the mouse, reading the
    menu that just opened and clicking an item takes far longer than 50ms. A
    synthetic click, though, lands inside the window and is swallowed in the
    capture phase before React's delegated listener sees it — the menu item then
    looks completely dead, with no error and nothing in the DOM to explain it.
  */
  await page.waitForTimeout(80);
}

type OpCall = { op: string; args: Record<string, unknown> };

const opsCalled = (page: Page): Promise<OpCall[]> =>
  page.evaluate(() => (window as unknown as { __mgitOps: OpCall[] }).__mgitOps);

/**
 * Waits for exactly `expected` ops to have been called, and returns them.
 *
 * Polled, not read once: selecting a menu item fires a react-query mutation, so
 * the call reaches the bridge a microtask or two after `click()` resolves. A
 * single read is a race that fails on a fast machine and passes on a slow one.
 */
async function expectOps(page: Page, expected: string[]): Promise<OpCall[]> {
  await expect
    .poll(async () => (await opsCalled(page)).map((call) => call.op))
    .toEqual(expected);
  return opsCalled(page);
}

test.describe('ref chip drag gestures, after the move to the BRANCH / TAG column', () => {
  test('a branch dropped on another offers merge and rebase', async ({ page }) => {
    await openGraph(page);

    await dragOnto(page, chip(page, 'refs/heads/feature/drag-me'), chip(page, 'refs/heads/main'));

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    // Both directions of the same gesture, named explicitly — the whole reason
    // a drop opens a menu instead of just merging.
    await expect(
      menu.getByRole('menuitem', { name: 'Merge feature/drag-me into main' }),
    ).toBeEnabled();
    await expect(
      menu.getByRole('menuitem', { name: 'Rebase main onto feature/drag-me' }),
    ).toBeEnabled();
  });

  test('choosing Merge reaches ops.merge with the dragged branch', async ({ page }) => {
    await openGraph(page);

    await dragOnto(page, chip(page, 'refs/heads/feature/drag-me'), chip(page, 'refs/heads/main'));
    await page.getByRole('menuitem', { name: 'Merge feature/drag-me into main' }).click();

    const calls = await expectOps(page, ['merge']);
    // The SOURCE is the chip that was dragged; the target is implicit in HEAD.
    expect(calls[0]?.args).toMatchObject({ source: 'feature/drag-me' });
  });

  test('choosing Rebase reaches ops.rebase with the branch dragged onto', async ({ page }) => {
    await openGraph(page);

    await dragOnto(page, chip(page, 'refs/heads/feature/drag-me'), chip(page, 'refs/heads/main'));
    await page.getByRole('menuitem', { name: 'Rebase main onto feature/drag-me' }).click();

    const calls = await expectOps(page, ['rebase']);
    expect(calls[0]?.args).toMatchObject({ onto: 'feature/drag-me' });
  });

  test('a commit dragged onto a branch offers a cherry-pick', async ({ page }) => {
    await openGraph(page);

    // The lane gutter is the commit's drag handle — dragging the subject would
    // fight text selection.
    await dragOnto(page, nodeOfRow(page, 'commit number 5'), chip(page, 'refs/heads/main'));

    const item = page.getByRole('menuitem', {
      name: `Cherry-pick ${sha(5).slice(0, 7)} onto main`,
    });
    await expect(item).toBeEnabled();
    await item.click();

    const calls = await expectOps(page, ['cherryPick']);
    expect(calls[0]?.args).toMatchObject({ shas: [sha(5)] });
  });

  test('dropping onto a branch that is not checked out explains itself', async ({ page }) => {
    await openGraph(page);

    // Reversed: `main` onto the feature branch. Neither op can run, because
    // both act on the CURRENT branch and the target is not it.
    await dragOnto(page, chip(page, 'refs/heads/main'), chip(page, 'refs/heads/feature/drag-me'));

    const merge = page.getByRole('menuitem', { name: 'Merge main into feature/drag-me' });
    await expect(merge).toBeDisabled();
    // A greyed item with no reason is the most frustrating thing a menu can do.
    await expect(merge).toHaveAttribute('title', /Check out feature\/drag-me first/);
    await expect(
      page.getByRole('menuitem', { name: 'Rebase feature/drag-me onto main' }),
    ).toBeDisabled();
  });

  test('a tag is neither a drag source nor a drop target', async ({ page }) => {
    await openGraph(page);

    // Onto the tag: `useRefDnd` disables the droppable, so there is no drop.
    await dragOnto(page, chip(page, 'refs/heads/feature/drag-me'), chip(page, 'refs/tags/v1.0.0'));
    await expect(page.getByRole('menu')).toHaveCount(0);

    // And from the tag: only local branches drag, since a tag cannot be merged.
    await dragOnto(page, chip(page, 'refs/tags/v1.0.0'), chip(page, 'refs/heads/main'));
    await expect(page.getByRole('menu')).toHaveCount(0);

    expect(await opsCalled(page)).toEqual([]);
  });

  test('a branch dropped on itself is a no-op, not an error', async ({ page }) => {
    await openGraph(page);

    const main = chip(page, 'refs/heads/main');
    await dragOnto(page, main, main);

    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await opsCalled(page)).toEqual([]);
  });

  /** The gesture, mid-flight, as the phase's visual record of this item. */
  test('screenshot the drop menu', async ({ page }) => {
    await openGraph(page);

    await dragOnto(page, chip(page, 'refs/heads/feature/drag-me'), chip(page, 'refs/heads/main'));
    await expect(page.getByRole('menu')).toBeVisible();
    await page.screenshot({ path: '../../docs/screenshots/phase-14/drop-menu.png' });
  });
});
