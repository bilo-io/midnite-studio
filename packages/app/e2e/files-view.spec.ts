import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Files view (Phase 16): lazy tree, gitignore dimming, and the read-only
 * preview pane — text through the mocked fs bridge, markdown with its
 * source ⇄ rendered toggle, and the binary fallback card.
 */

const filesFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'repo:': [
      { name: 'src', kind: 'dir', size: 0, isIgnored: false },
      { name: 'node_modules', kind: 'dir', size: 0, isIgnored: true },
      { name: 'README.md', kind: 'file', size: 120, isIgnored: false },
      { name: 'logo.bin', kind: 'file', size: 2048, isIgnored: false },
      { name: 'shot.png', kind: 'file', size: 4096, isIgnored: false },
      { name: 'fresh.png', kind: 'file', size: 4096, isIgnored: false },
    ],
    'repo:src': [{ name: 'main.ts', kind: 'file', size: 64, isIgnored: false }],
  },
  fsFiles: {
    'repo:README.md': {
      kind: 'text',
      content: '# Midnite\n\nA **git client**. See [the site](https://example.com).',
      size: 120,
    },
    'repo:src/main.ts': { kind: 'text', content: 'const answer = 42;\n', size: 64 },
    'repo:logo.bin': { kind: 'binary', size: 2048 },
  },
  /*
    `shot.png` is modified against HEAD and `fresh.png` is untracked — the two
    sides of the Compare gate. `src/main.ts` is modified too, so a Theme F spec
    can assert the rollup badge on `src` before it's ever expanded. The preview
    reads status for the first two; the tree badges read all three.
  */
  statusEntries: [
    {
      path: 'shot.png',
      origPath: null,
      staged: 'unmodified',
      unstaged: 'modified',
      conflicted: false,
      similarity: null,
    },
    {
      path: 'fresh.png',
      origPath: null,
      staged: 'untracked',
      unstaged: 'untracked',
      conflicted: false,
      similarity: null,
    },
    {
      path: 'src/main.ts',
      origPath: null,
      staged: 'unmodified',
      unstaged: 'modified',
      conflicted: false,
      similarity: null,
    },
  ],
};

async function openFiles(page: Page): Promise<void> {
  await installMockBridge(page, filesFixtures);
  await page.goto('/');
  await page.getByRole('link', { name: 'Files' }).click();
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
}

test('lazy tree: children appear on expand, ignored entries render dimmed', async ({ page }) => {
  await openFiles(page);

  // Root listing shows; src's children don't exist yet (lazy).
  await expect(page.getByRole('treeitem', { name: /^src$/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /main\.ts/ })).toHaveCount(0);

  await page.getByRole('treeitem', { name: /^src$/ }).click();
  await expect(page.getByRole('treeitem', { name: /main\.ts/ })).toBeVisible();

  // The gitignored directory is present but dimmed, and never auto-expanded.
  const ignored = page.getByRole('treeitem', { name: /node_modules/ });
  await expect(ignored).toHaveClass(/opacity-45/);
});

test('selecting a code file shows the read-only highlighted preview', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /^src$/ }).click();
  await page.getByRole('treeitem', { name: /main\.ts/ }).click();

  await expect(page.getByText('read-only')).toBeVisible();
  await expect(page.getByText('const answer = 42;')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '../../docs/screenshots/phase-16/files-code.png' });
});

test('markdown renders, and the toggle reveals the source', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /README\.md/ }).click();
  // Rendered: the strong tag exists, the literal asterisks don't.
  await expect(page.getByText('git client', { exact: true })).toBeVisible();
  await expect(page.getByText('**git client**')).toHaveCount(0);

  // Links are live now that Phase 12 E has landed, and route through the
  // guarded `shell:open-external` channel rather than navigating this window —
  // which, in a `file://` SPA with no browser chrome, would be one-way.
  const link = page.getByRole('link', { name: 'the site' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole('button', { name: 'Source' })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as never as { __mgitExternalUrls: string[] }).__mgitExternalUrls,
    ),
  ).toHaveLength(1);

  await page.getByRole('button', { name: 'Source' }).click();
  await expect(page.getByText(/\*\*git client\*\*/)).toBeVisible();
});

test('a binary file gets the fallback card, not a preview', async ({ page }) => {
  await openFiles(page);

  await page.getByRole('treeitem', { name: /logo\.bin/ }).click();
  await expect(page.getByText(/Binary file · 2\.0 KB/)).toBeVisible();
});

test('a changed image offers the before/after comparison the diff pane gives', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /shot\.png/ }).click();

  // Off by default: the Files view answers "what is this file" first, and the
  // comparison is the follow-up question.
  await expect(page.getByTestId('image-diff')).toHaveCount(0);

  const compare = page.getByRole('button', { name: 'Compare' });
  await expect(compare).toBeVisible();
  await compare.click();

  // The bytes come from `mgit-file://`, which does not exist in a browser, so
  // this asserts the viewer's chrome — both revisions named, modes offered.
  const viewer = page.getByTestId('image-diff');
  await expect(viewer.getByTestId('image-before')).toBeVisible();
  await expect(viewer.getByTestId('image-after')).toBeVisible();
  await viewer.getByRole('button', { name: 'Onion' }).click();
  await expect(viewer.getByRole('slider', { name: 'New revision opacity' })).toBeVisible();

  // And back, without leaving the file.
  await page.getByRole('button', { name: 'Current' }).click();
  await expect(page.getByTestId('image-diff')).toHaveCount(0);
});

test('an untracked image offers no comparison — HEAD holds no pre-image', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /fresh\.png/ }).click();

  // The single-image pane rendered — proof the preview really opened on this
  // file, which is what makes the absent button mean something.
  await expect(page.getByRole('img', { name: 'fresh.png' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare' })).toHaveCount(0);
});

test('status badges mark changed rows, including a rollup on the collapsed directory (Phase 24 F)', async ({
  page,
}) => {
  await openFiles(page);

  const shot = page.getByRole('treeitem', { name: /^shot\.png$/ });
  await expect(shot.getByText('M', { exact: true })).toBeVisible();

  const fresh = page.getByRole('treeitem', { name: /^fresh\.png$/ });
  await expect(fresh.getByText('U', { exact: true })).toBeVisible();

  // `src` hasn't been expanded yet — this "M" is the rollup off `src/main.ts`.
  const src = page.getByRole('treeitem', { name: /^src$/ });
  await expect(src.getByText('M', { exact: true })).toBeVisible();

  await src.click();
  const mainTs = page.getByRole('treeitem', { name: /^main\.ts$/ });
  await expect(mainTs.getByText('M', { exact: true })).toBeVisible();

  // README.md has no status entry at all — no badge, not a false "clean" one.
  const readme = page.getByRole('treeitem', { name: /^README\.md$/ });
  await expect(readme.getByText('M', { exact: true })).toHaveCount(0);

  await page.waitForTimeout(200);
  await page.screenshot({ path: '../../docs/screenshots/phase-24-f/status-badges.png' });
});
