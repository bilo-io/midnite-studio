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

  // A diff has to be open for "the space goes to the diff" to be measurable at
  // all — the closed state is a one-line placeholder either way.
  await files(page)
    .getByRole('button', { name: 'packages/desktop/src/main/window.ts', exact: true })
    .click();
  await expect(page.getByTestId('diff-view')).toBeVisible();
  const paneBefore = (await page.getByTestId('diff-view').boundingBox())?.height ?? 0;

  await page.getByRole('button', { name: 'Hide the commit details' }).click();

  // The message and the parents go; the sha, the copy button and the tree/list
  // toggle stay, because they are the accordion's own header row.
  await expect(identities(page)).toHaveCount(0);
  await expect(page.getByTestId('commit-message')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy the full sha' })).toBeVisible();
  await expect(files(page)).toBeVisible();

  // The whole point of closing it: the height goes to the diff below.
  const paneAfter = (await page.getByTestId('diff-view').boundingBox())?.height ?? 0;
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

  const pane = page.getByTestId('commit-file-pane');
  const before = (await pane.boundingBox())?.height ?? 0;

  const handle = page.getByRole('separator', { name: 'Resize the commit file list' });
  const box = await handle.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 80);
  await page.mouse.up();

  const after = (await pane.boundingBox())?.height ?? 0;
  expect(after).toBeGreaterThan(before + 40);
});

// --- screenshots ----------------------------------------------------------

/**
 * The phase doc's verification shot: the inspector in tree mode with a diff
 * open. Written to `docs/screenshots/phase-12/`, alongside the earlier phases'.
 */
test('screenshot the inspector', async ({ page }) => {
  // Phase 56 Theme F: this test exists to produce the two PNGs below, so
  // ungated it rewrote them on every routine `app:e2e` run rather than an
  // explicit regeneration — the same reason `footer-monitor.spec.ts`'s own
  // `screenshots` test gates itself this way.
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCommit(page);

  await files(page)
    .getByRole('button', { name: 'packages/desktop/src/main/window.ts', exact: true })
    .click();
  await expect(page.getByTestId('diff-view')).toBeVisible();
  // Let the cascade and the diff's own fade settle, or the shot catches the app
  // mid-animation and reads as a rendering bug.
  await page.waitForTimeout(500);
  await page.screenshot({ path: '../../docs/screenshots/phase-12/inspector-tree-with-diff.png' });

  await page.getByRole('button', { name: 'List the files by how much changed' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '../../docs/screenshots/phase-12/inspector-list-view.png' });
});
