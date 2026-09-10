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
  // Phase 56 Theme F: this test's own assertions are the coverage, so only
  // the incidental screenshot is gated — an unconditional skip would drop
  // real functional coverage on every routine run.
  if (process.env.MSTUDIO_SHOTS) {
    await page.screenshot({ path: '../../docs/screenshots/phase-24-d/editor-clean.png' });
  }
});

