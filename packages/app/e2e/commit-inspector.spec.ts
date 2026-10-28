import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The commit inspector — Phase 12 Themes A and B.
 *
 * **15 of this spec's original 19 tests moved to
 * `commit-detail.bridge.test.tsx` under jsdom** (Phase 82 Theme C, wave 2):
 * the rendered message (markdown, sha/URL/#issue linkification, trailers),
 * the header (sha, copy, parent/linked-sha navigation, the not-found state)
 * and the file tree/list views. See that file's own header comment for the
 * removed-test → replacement-test mapping and this PR's body for the full
 * diff.
 *
 * **4 remain here, genuine stragglers.** Two need a real page reload to
 * prove `zustand/persist` rehydration — "the metadata collapses to its
 * header, and the choice survives a reload" (which also measures a real
 * `boundingBox` height, the diff pane growing once the metadata closes) and
 * "the tree ⇄ list choice survives a reload" — jsdom cannot honestly
 * reproduce either, the same reasoning `settings-pages.spec.ts`'s own
 * comment gives for its reload straggler. "The file list and the diff can be
 * resized against each other" is a real pointer drag over a real
 * `getBoundingClientRect`. And the inspector screenshot is Theme D's
 * territory.
 */

/** A GitHub remote, so `#123` has somewhere to point. */
const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const withRemote: MockFixtures = { ...fixtures, remotes: REMOTES };

/** Open the app and select the fixture commit. */
async function openCommit(page: Page, data: MockFixtures = withRemote): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');

  const row = page.getByText('feat(phase-11): package, install and run from /Applications').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('commit-message')).toBeVisible();
}

const files = (page: Page) => page.getByTestId('commit-files');
const identities = (page: Page) => page.getByTestId('commit-identities');

test('the metadata collapses to its header, and the choice survives a reload', async ({ page }) => {
  await openCommit(page);

  // Open by default: the message and the identities are what the inspector is
  // for, and a panel that starts folded hides them behind a control nobody has
  // been told about.
  await expect(identities(page)).toBeVisible();

  // The graph opens a commit inline, in the inspector's split layout: the
  // details sit above the file list in the left column, so closing them is
  // measured on the file list, which is what inherits the height.
  const paneBefore = (await page.getByTestId('commit-file-pane').boundingBox())?.height ?? 0;

  await page.getByRole('button', { name: 'Hide the commit details' }).click();

  // The message and the parents go; the sha, the copy button and the tree/list
  // toggle stay, because they are the accordion's own header row.
  await expect(identities(page)).toHaveCount(0);
  await expect(page.getByTestId('commit-message')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy the full sha' })).toBeVisible();
  await expect(files(page)).toBeVisible();

  // The whole point of closing it: the height goes to the file list below.
  const paneAfter = (await page.getByTestId('commit-file-pane').boundingBox())?.height ?? 0;
  expect(paneAfter).toBeGreaterThan(paneBefore + 40);

  await page.reload();
  const row = page.getByText('feat(phase-11): package, install and run from /Applications').first();
  await row.click();
  await expect(page.getByRole('button', { name: 'Show the commit details' })).toBeVisible();
  await expect(identities(page)).toHaveCount(0);
});

test('the tree ⇄ list choice survives a reload', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: 'List the files by how much changed' }).click();

  await page.reload();
  const row = page.getByText('feat(phase-11): package, install and run from /Applications').first();
  await row.click();

  // Persisted in the ui-store, so the pane comes back in list mode — the phase
  // doc's requirement that the choice survive a repo switch, tested the harder
  // way round.
  await expect(
    files(page).getByRole('button', { name: 'pnpm-lock.yaml', exact: true }),
  ).toBeVisible();
  await expect(
    files(page).getByRole('button', { name: 'packages/desktop/src/main', exact: true }),
  ).toHaveCount(0);
});

test('the file list and the diff can be resized against each other', async ({ page }) => {
  await openCommit(page);

  // Inline, the list is the left column and the diff the right one, so the
  // splitter between them is a vertical rule dragged sideways.
  const pane = page.getByTestId('commit-file-pane');
  const before = (await pane.boundingBox())?.width ?? 0;

  const handle = page.getByRole('separator', { name: 'Resize the commit file list' });
  const box = await handle.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 80, box!.y + box!.height / 2);
  await page.mouse.up();

  const after = (await pane.boundingBox())?.width ?? 0;
  expect(after).toBeGreaterThan(before + 40);
});
