import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 112 Theme C — `revealCommit` lands on a commit the virtualizer has not
 * rendered.
 *
 * **Browser capabilities this needs:** real layout (`getBoundingClientRect`,
 * all zeros under jsdom) and the virtualizer's real scroll — the claim is that
 * a commit 450 rows down, nowhere near the first screenful, ends up selected
 * AND inside the scroller's visible box. The store transitions around it (short
 * sha expansion, filter clearing, the row cap, waiting for the stream) are
 * vitest (`reveal-commit.test.ts`).
 */

const sha = (i: number) => i.toString(16).padStart(7, '0').padEnd(40, 'c');
const TARGET = 451;

const ROWS = Array.from({ length: 600 }, (_, i) => ({
  row: i,
  commit: {
    sha: sha(i + 1),
    parents: [sha(i + 2)],
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    authorDate: 1_787_000_000 - i * 60,
    committerDate: 1_787_000_000 - i * 60,
    subject: `reveal commit ${i + 1}`,
    refs: [],
  },
  lane: 0,
  colorIdx: 0,
  edges: [{ fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 }],
  laneCount: 1,
}));

const DATA: MockFixtures = {
  ...fixtures,
  graphRows: ROWS,
  revisions: { [sha(TARGET).slice(0, 7)]: sha(TARGET) },
};

const row = (page: Page, n: number) =>
  page.getByRole('row').filter({ has: page.getByText(`reveal commit ${n}`, { exact: true }) });

test('revealing a commit far outside the rendered window selects it and brings it into the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(row(page, 1)).toBeVisible();
  await expect(row(page, TARGET)).toHaveCount(0);

  const repoId = await page.evaluate(
    async () => (await (await import('/src/store/ui-store.ts')).useUiStore.getState()).selectedRepoId,
  );
  const result = await page.evaluate(
    async ([repo, rev]) => {
      const mod = await import('/src/features/graph/reveal-commit.ts');
      return mod.revealCommit(repo!, rev!);
    },
    [repoId, sha(TARGET).slice(0, 7)],
  );
  expect(result).toMatchObject({ ok: true, sha: sha(TARGET) });

  const target = row(page, TARGET);
  await expect(target).toBeVisible();
  await expect(target).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () => {
      const box = await target.first().boundingBox();
      const grid = await page.getByRole('grid').first().boundingBox();
      return box !== null && grid !== null && box.y >= grid.y - 1 && box.y + box.height <= grid.y + grid.height + 1;
    })
    .toBe(true);
});
