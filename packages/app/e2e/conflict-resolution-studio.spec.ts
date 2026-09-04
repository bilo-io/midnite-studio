import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Conflict Resolution Studio (Phase 47 Theme D), end to end.
 *
 * `conflict-resolution-studio.test.tsx` already pins the component's own
 * logic down against a mocked bridge; what only a real render can show is
 * the whole chain — `ConflictBanner`'s path list is genuinely clickable, it
 * genuinely opens the Studio in the graph's side panel, and accepting a
 * region genuinely reaches `ops.conflictApplyHunk` with the payload the
 * git-engine side (Theme C) actually expects.
 */
const CONFLICTED_ENTRY = {
  path: 'src/f.txt',
  origPath: null,
  staged: 'unmodified',
  unstaged: 'conflicted',
  conflicted: true,
  similarity: null,
};

const TWO_REGIONS = [
  {
    segments: [
      { kind: 'context', lines: ['shared line'] },
      { kind: 'conflict', region: { ours: ['MAIN1'], theirs: ['FEAT1'], base: null } },
      { kind: 'context', lines: ['middle'] },
      { kind: 'conflict', region: { ours: ['MAIN2'], theirs: ['FEAT2'], base: null } },
    ],
  },
];

const base: MockFixtures = {
  ...fixtures,
  statusEntries: [CONFLICTED_ENTRY],
  inProgress: 'merge',
  conflictRegions: { 'src/f.txt': TWO_REGIONS },
};

const open = async (page: Page, data: MockFixtures = base): Promise<void> => {
  await installMockBridge(page, data);
  await page.goto('/graph');
  await expect(page.getByTestId('conflict-banner').getByText('Merge in progress')).toBeVisible();
};

test('the conflicted path in the banner opens the Studio, showing every region', async ({ page }) => {
  await open(page);

  await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/f.txt' }).click();

  const studio = page.getByTestId('conflict-resolution-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByText('2 regions left')).toBeVisible();
  await expect(studio.getByText('shared line')).toBeVisible();
  await expect(studio.getByText('MAIN1')).toBeVisible();
  await expect(studio.getByText('FEAT1')).toBeVisible();
  await expect(studio.getByText('MAIN2')).toBeVisible();
});

test('accepting one region calls conflictApplyHunk with that exact region and side', async ({ page }) => {
  await open(page);
  await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/f.txt' }).click();

  await page.getByTestId('conflict-resolution-studio').getByRole('button', { name: 'Accept mine' }).first().click();

  const ops = await page.evaluate(
    () =>
      (
        window as unknown as {
          __mstudioOps: { op: string; args: { regionIndex: number; side: string; path: string } }[];
        }
      ).__mstudioOps,
  );
  const applyHunkCalls = ops.filter((c) => c.op === 'conflictApplyHunk');
  expect(applyHunkCalls).toHaveLength(1);
  expect(applyHunkCalls[0]?.args).toMatchObject({ path: 'src/f.txt', regionIndex: 0, side: 'ours' });
});

test('Accept all mine closes the Studio and calls the whole-file op', async ({ page }) => {
  await open(page);
  await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/f.txt' }).click();

  await page.getByTestId('conflict-resolution-studio').getByRole('button', { name: 'Accept all mine' }).click();

  await expect(page.getByTestId('conflict-resolution-studio')).toBeHidden();
  const ops = await page.evaluate(
    () => (window as unknown as { __mstudioOps: { op: string; args: { side: string } }[] }).__mstudioOps,
  );
  expect(ops.filter((c) => c.op === 'conflictResolveWholeFile')).toHaveLength(1);
});

test('closing the Studio returns to no side panel at all', async ({ page }) => {
  await open(page);
  await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/f.txt' }).click();
  const studio = page.getByTestId('conflict-resolution-studio');
  await expect(studio).toBeVisible();

  // The aside's own header close button — the only "Close" control on screen
  // in this flow (no toast is showing; accepting a conflict resolution is not
  // one of the ops that raises one).
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(studio).toBeHidden();
});

test('a plain (non-conflicted) status entry never renders as a clickable banner row', async ({ page }) => {
  await installMockBridge(page, {
    ...fixtures,
    statusEntries: [{ ...CONFLICTED_ENTRY, path: 'clean.txt', conflicted: false, unstaged: 'modified' }],
    inProgress: 'merge',
  });
  await page.goto('/graph');

  const banner = page.getByTestId('conflict-banner');
  await expect(banner.getByText('Merge in progress')).toBeVisible();
  await expect(banner.getByText('conflicts resolved — ready to continue')).toBeVisible();
  await expect(banner.getByRole('button', { name: 'clean.txt' })).toHaveCount(0);
});

/**
 * "Suggest a resolution" (Phase 47 Theme E), end to end. The mock's own
 * `council.run.start` answers with an already-`completed` run synchronously
 * (real member/synthesis orchestration is main-only, covered by
 * `council-runner.test.ts`) — exactly what lets this assert the advisory
 * text renders without choreographing a fake multi-process race.
 */
const REVIEWERS_COUNCIL = {
  id: 'c1',
  name: 'Reviewers',
  members: [{ id: 'm1', name: 'Reviewer', provider: 'agy', role: 'Review the conflict.' }],
  synthProvider: 'agy',
};

test('with a council available, "Suggest a resolution" runs it and shows the advisory text', async ({ page }) => {
  await installMockBridge(page, { ...base, councils: [REVIEWERS_COUNCIL] });
  await page.goto('/graph');
  await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/f.txt' }).click();

  const studio = page.getByTestId('conflict-resolution-studio');
  await expect(studio.getByLabel('Suggestions from')).toBeVisible();
  await studio.getByRole('button', { name: 'Suggest a resolution' }).first().click();

  await expect(studio.getByText(/Synthesis of the panel's views/)).toBeVisible();

  // Purely advisory — Accept mine is still there, unaffected, still a click away.
  await expect(studio.getByRole('button', { name: 'Accept mine' }).first()).toBeEnabled();
});

test('with no council yet, the Studio shows no picker and no suggest button', async ({ page }) => {
  await open(page);
  await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/f.txt' }).click();

  const studio = page.getByTestId('conflict-resolution-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByLabel('Suggestions from')).toHaveCount(0);
  await expect(studio.getByRole('button', { name: 'Suggest a resolution' })).toHaveCount(0);
});
