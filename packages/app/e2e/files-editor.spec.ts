// e2e-capability: network/CSP interception
import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The preview pane becomes an editor (Phase 24 Theme D): Monaco (Phase 64
 * Theme C — replacing CodeMirror 6) behind an explicit Edit toggle, Cmd+S
 * through the command registry, and an unsaved-changes guard on navigating
 * away from a dirty buffer.
 *
 * Phase 82 Theme C wave 5 moved the dirty-indicator/Save round trip, the
 * guard's Save/Discard/Cancel choices, the stale-write Reload offer and the
 * Done focus-restore to
 * `src/features/files/preview/file-preview.bridge.test.tsx`, mounting
 * `FilesView` + `FileEditorGuard` directly with `@monaco-editor/react`'s
 * `<Editor>` mocked. **The 2 tests left here need real Monaco**: the first
 * asserts on actual network requests against Vite's dev-server module graph
 * (no Monaco chunk should ever be requested before Edit is clicked), and the
 * second asserts on `.monaco-editor .margin`/`.view-lines`, real Monaco DOM a
 * mock does not produce.
 */

const editorFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'repo:': [
      { name: 'a.ts', kind: 'file', size: 20, isIgnored: false },
      { name: 'b.ts', kind: 'file', size: 8, isIgnored: false },
      { name: 'notes.md', kind: 'file', size: 12, isIgnored: false },
    ],
  },
  fsFiles: {
    'repo:a.ts': {
      kind: 'text',
      content: 'const answer = 42;\n',
      size: 20,
      version: { mtimeMs: 1, size: 20 },
    },
    'repo:b.ts': { kind: 'text', content: 'const x = 1;\n', size: 8 },
    'repo:notes.md': { kind: 'text', content: '# Notes\n\nhi\n', size: 12 },
  },
};

async function openFiles(page: Page): Promise<void> {
  await installMockBridge(page, editorFixtures);
  await page.goto('/');
  await clickRailLink(page, 'Explorer');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
}

test('single-clicking a file renders the Shiki preview, requesting no Monaco chunk (Phase 64 Theme G)', async ({
  page,
}) => {
  const requestUrls: string[] = [];
  page.on('request', (req) => requestUrls.push(req.url()));

  await openFiles(page);
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();

  // The read-only Shiki preview, plus its own Edit toggle — not Monaco.
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.getByTestId('code-editor')).toHaveCount(0);

  // `code-editor.tsx` (the `React.lazy` boundary around Monaco) is only
  // imported once `editing` is true — a single click never sets it, so
  // neither that module, `monaco-loader.ts`/`monaco-languages.ts`, nor the
  // `monaco-editor`/`@monaco-editor/react` packages themselves should ever
  // have been requested, even under Vite's dev-server on-demand graph.
  //
  // NOT a bare `/monaco/i` match: `ui-store.ts` eagerly imports
  // `lib/monaco/editor-prefs.ts` for the editor's default font size/family —
  // three plain constants, unrelated to Monaco the library actually loading,
  // and legitimately requested on every boot regardless of this test. A
  // broader match false-positives on that file's own path.
  const monacoRequests = requestUrls.filter((url) =>
    /monaco-editor|monaco-loader|monaco-languages|code-editor\.tsx/i.test(url),
  );
  expect(monacoRequests, `unexpected Monaco-related requests: ${monacoRequests.join(', ')}`).toEqual(
    [],
  );
});

test('Edit swaps the read-only preview for a Monaco editor with a gutter', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  // The static "read-only" label is only for what cannot be edited — a repo-
  // scope text file gets the Edit toggle in its place from the moment it loads.
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await expect(page.locator('.monaco-editor .margin')).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('const answer = 42;');
});


/*
  Phase 77 Theme A — the ~6.8 MB TypeScript worker is its own lazy chunk, fetched by the first
  `.ts`/`.js` model and by nothing else. Mechanism: `page.on('request')` against Vite's dev-server
  module graph (the production build inlines the worker as base64 inside that lazy chunk, which
  `dist/.vite/manifest.json` shows as a dynamic import of `monaco-editor/language/typescript/
  ts.worker`, not a static one — the build-side half of this check is recorded in the PR).
*/
test('a Markdown editor requests no TypeScript worker, a TypeScript one does (Phase 77 Theme A)', async ({
  page,
}) => {
  const requestUrls: string[] = [];
  page.on('request', (req) => requestUrls.push(req.url()));

  await openFiles(page);
  await page.getByRole('treeitem', { name: /^notes\.md$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('# Notes');
  // Monaco is up and has had every chance to ask for a worker.
  await page.waitForTimeout(1500); // allow-timeout: absence assertion, nothing to await
  expect(requestUrls.filter((url) => /ts\.worker/i.test(url))).toEqual([]);

  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  const tsWorker = page.waitForRequest((req) => /ts\.worker/i.test(req.url()), { timeout: 20_000 });
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('const answer = 42;');
  await tsWorker;
});

/*
  Phase 77 Theme A — `editor.api` + an explicit feature list. `code-editor.tsx`'s Escape handling
  reads `findWidgetVisible` off the private context-key service, which only exists if the find
  contribution is registered: Ctrl+F must open the find widget, and the first Escape must close it
  while leaving the editor itself open.
*/
test('the find widget opens and the first Escape closes only it (Phase 77 Theme A)', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('treeitem', { name: /^a\.ts$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('const answer = 42;');

  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('Control+f');
  await expect(page.locator('.monaco-editor .find-widget.visible')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.monaco-editor .find-widget.visible')).toHaveCount(0);
  await expect(page.getByTestId('code-editor')).toBeVisible();
});
