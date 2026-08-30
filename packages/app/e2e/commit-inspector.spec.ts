import { expect, test, type Page } from '@playwright/test';

import {
  COMMIT_SHA,
  fixtures,
  LINKED_ABBREV,
  LINKED_SHA,
  ORPHAN_ABBREV,
  PARENT_SHA,
} from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The commit inspector — Phase 12 Themes A and B.
 *
 * These cover what the unit tests cannot: that the matcher's output becomes real
 * controls, that activating one navigates the panel to another commit (including
 * one below the loaded graph window, which is the whole point of resolving the
 * sha in main), and that the tree/list toggle survives a reload.
 */

/** A GitHub remote, so `#123` has somewhere to point. */
const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
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

const message = (page: Page) => page.getByTestId('commit-message');
const files = (page: Page) => page.getByTestId('commit-files');
const identities = (page: Page) => page.getByTestId('commit-identities');
/** A directory row, matched exactly so a nested file's path cannot satisfy it. */
const dir = (page: Page, path: string) =>
  files(page).getByRole('button', { name: path, exact: true });
const clipboard = (page: Page) => page.evaluate(() => (window as never as { __mstudioClipboard: string[] }).__mstudioClipboard);
const externals = (page: Page) => page.evaluate(() => (window as never as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls);

// --- Theme A: the rendered message ----------------------------------------

test('the message renders as markdown rather than preformatted text', async ({ page }) => {
  await openCommit(page);

  // A fenced block becomes a real `pre`, which is what makes "do not linkify
  // inside code" an ancestor test rather than a regex problem.
  await expect(message(page).locator('pre code')).toContainText('const sha = 7c521fe;');
});

test('a sha inside a code fence is not turned into a control', async ({ page }) => {
  await openCommit(page);

  // `7c521fe` appears ONLY inside the fence in this fixture, so any button
  // bearing it would have come from linkifying code.
  await expect(message(page).getByRole('button', { name: '7c521fe' })).toHaveCount(0);
});

test('an all-letter hex word in prose stays prose', async ({ page }) => {
  await openCommit(page);

  await expect(message(page)).toContainText('The deadbeef path is unaffected.');
  await expect(message(page).getByRole('button', { name: 'deadbeef' })).toHaveCount(0);
});

test('a URL in the message opens externally rather than navigating the window', async ({ page }) => {
  await openCommit(page);

  await message(page).getByRole('link', { name: 'https://example.com/notes' }).click();

  // Still the app, and the URL went over the guarded channel. A real anchor
  // navigation would have replaced the whole SPA — there is no browser chrome
  // around it to come back with.
  await expect(message(page)).toBeVisible();
  expect(await externals(page)).toEqual(['https://example.com/notes']);
});

test('#123 resolves against the forge remote', async ({ page }) => {
  await openCommit(page);

  await message(page).getByRole('link', { name: '#123' }).click();
  expect(await externals(page)).toEqual(['https://github.com/bilo-io/midnite-git/issues/123']);
});

test('#123 stays plain text in a repo with no forge remote', async ({ page }) => {
  // The phase doc's degrade-not-error requirement: inventing a link that 404s is
  // worse than rendering the text the author wrote.
  await openCommit(page, { ...fixtures, remotes: [] });

  await expect(message(page)).toContainText('#123');
  await expect(message(page).getByRole('link', { name: '#123' })).toHaveCount(0);
});

test('the trailer block renders as metadata, with its email linkified', async ({ page }) => {
  await openCommit(page);

  const trailers = page.getByTestId('commit-trailers');
  await expect(trailers).toContainText('Co-Authored-By');

  // Split off the body, not left in it.
  await expect(message(page).locator('p', { hasText: 'Co-Authored-By' })).toHaveCount(0);

  await trailers.getByRole('link', { name: 'noreply@anthropic.com' }).click();
  expect(await externals(page)).toEqual(['mailto:noreply@anthropic.com']);
});

// --- Theme B: the header --------------------------------------------------

test('the header shows the full sha and copies it through the bridge', async ({ page }) => {
  await openCommit(page);

  await expect(page.getByText(COMMIT_SHA, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy the full sha' }).click();

  // The full 40 characters, not the abbreviation the header could have shown.
  expect(await clipboard(page)).toEqual([COMMIT_SHA]);
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
});

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
  await expect(message(page)).toHaveCount(0);
  await expect(page.getByText(COMMIT_SHA, { exact: true })).toBeVisible();
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

test('the committer row appears only when it differs from the author', async ({ page }) => {
  await openCommit(page);

  await expect(identities(page)).toContainText('committer');
  await expect(identities(page)).toContainText('GitHub');

  // The root commit has the same identity on both sides.
  await page.getByRole('button', { name: `Show commit ${PARENT_SHA}` }).click();
  await expect(page.getByText('chore: initial import').first()).toBeVisible();
  await expect(identities(page)).not.toContainText('committer');
});

test('a parent sha navigates the panel, and a root commit says it has none', async ({ page }) => {
  await openCommit(page);

  await page.getByRole('button', { name: `Show commit ${PARENT_SHA}` }).click();

  await expect(page.getByText(PARENT_SHA, { exact: true })).toBeVisible();
  await expect(page.getByText('Root commit — no parents.')).toBeVisible();
});

test('a linkified sha selects a commit that is not in the loaded graph', async ({ page }) => {
  // The fixture graph holds exactly one row, and LINKED_SHA is not it — so this
  // can only work by resolving the abbreviation and fetching the detail directly.
  await openCommit(page);

  await message(page).getByRole('button', { name: LINKED_ABBREV }).click();

  await expect(page.getByText(LINKED_SHA, { exact: true })).toBeVisible();
  await expect(page.getByText('fix(graph): the linkified target').first()).toBeVisible();
});

test('a sha that resolves to nothing renders the not-found state', async ({ page }) => {
  const orphaned: MockFixtures = {
    ...withRemote,
    commitDetails: {
      ...fixtures.commitDetails,
      [COMMIT_SHA]: {
        ...(fixtures.commitDetails[COMMIT_SHA] as Record<string, unknown>),
        body: `feat: a commit\n\nReverts ${ORPHAN_ABBREV} which we no longer have.`,
      },
    },
  };
  await openCommit(page, orphaned);

  await message(page).getByRole('button', { name: ORPHAN_ABBREV }).click();

  await expect(page.getByText('Commit not found')).toBeVisible();
  await expect(page.getByText(/is not in this repository/)).toBeVisible();
});

// --- Theme B: the file views ---------------------------------------------

test('the tree groups files by folder and collapses single-child chains', async ({ page }) => {
  await openCommit(page);

  // `packages/desktop/src/main` is four nested directories holding one file, and
  // it must read as one row rather than four indents of nothing.
  await expect(dir(page, 'packages/desktop/src/main')).toBeVisible();
  await expect(dir(page, '.github/workflows')).toBeVisible();
});

test('collapsing a directory hides its files but keeps its totals', async ({ page }) => {
  await openCommit(page);

  const main = dir(page, 'packages/desktop/src/main');
  const windowTs = files(page).getByRole('button', {
    name: 'packages/desktop/src/main/window.ts',
    exact: true,
  });

  await expect(main).toContainText('+4');
  await expect(windowTs).toBeVisible();

  await main.click();

  await expect(windowTs).toHaveCount(0);
  // Still says how much is inside — collapsing must not hide the number you
  // collapsed in order to compare.
  await expect(main).toContainText('+4');
});

test('list view orders by change size, biggest first', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: 'List the files by how much changed' }).click();

  const rows = files(page).getByRole('button');
  // 4000 > 5 > 2 > 0 — nothing like the alphabetical order of the tree.
  await expect(rows.nth(0)).toHaveAttribute('aria-label', 'pnpm-lock.yaml');
  await expect(rows.nth(1)).toHaveAttribute(
    'aria-label',
    'packages/desktop/src/main/window.ts',
  );
  await expect(rows.nth(3)).toHaveAttribute(
    'aria-label',
    'docs/screenshots/phase-11-packaged-app.png',
  );
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
  await expect(dir(page, 'packages/desktop/src/main')).toHaveCount(0);
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
