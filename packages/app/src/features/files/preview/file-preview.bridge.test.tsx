import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeFixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { useFileEditorStore } from '../../../store/file-editor-store';
import { FilesView } from '../files-view';
import { useFilesStore } from '../files-store';
import { FileEditorGuard } from './file-editor-guard';

/**
 * Migrated from `e2e/files-editor.spec.ts` (Phase 82 Theme C wave 5) — the
 * dirty indicator/Save round trip, the unsaved-changes guard's Save/Discard/
 * Cancel choices, the stale-write Reload offer, and Done's focus restore to
 * the Edit button. 5 of the original 7 tests moved here; 2 stay in
 * Playwright, below.
 *
 * `@monaco-editor/react`'s `<Editor>` is mocked via `test-support/module-mocks`
 * (`mockMonacoEditorModule`/`mockMonacoLoaderModule`) — the same pattern
 * `code-editor.test.tsx` already uses by hand — since Monaco needs a real DOM
 * layout engine and worker threads jsdom does not provide. Everything under
 * test here (the dirty flag, the save round trip, the guard dialog, the
 * stale-write banner, the focus restore) lives in `file-preview.tsx` and
 * `code-editor.tsx`'s own wiring around `<Editor>`, not inside Monaco's own
 * rendering, so mocking only the leaf component keeps every one of those real.
 *
 * **`FilePreview` lazy-loads `./code-editor` itself** (`React.lazy(() =>
 * import('./code-editor'))`, code-split to keep Monaco out of every ordinary
 * Files-view load) — a genuine internal lazy boundary, not just the outer
 * view-registry's, so the `beforeAll` below warms vitest's module cache
 * before any test's clock starts (see `diff-view.bridge.test.tsx`'s identical
 * reasoning for `commit-message`).
 *
 * **2 of the original 7 stay in Playwright**, both needing something jsdom
 * cannot provide: "single-clicking renders the Shiki preview, requesting no
 * Monaco chunk" asserts on real network requests against Vite's dev-server
 * module graph, and "Edit swaps the read-only preview for a Monaco editor
 * with a gutter" asserts on `.monaco-editor .margin`/`.view-lines`, real
 * Monaco DOM this file's own mock does not produce.
 */

vi.mock('@monaco-editor/react', () =>
  import('../../../../test-support/module-mocks').then((m) => m.mockMonacoEditorModule()),
);
vi.mock('../../../lib/monaco/monaco-loader', () =>
  import('../../../../test-support/module-mocks').then((m) => m.mockMonacoLoaderModule()),
);

beforeAll(async () => {
  await import('./code-editor');
});

function editorFixtures() {
  return makeFixtures({
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
  });
}

async function openFiles(data = editorFixtures()): Promise<void> {
  renderView(
    <>
      <FilesView />
      <FileEditorGuard />
    </>,
    { fixtures: data, uiState: { selectedRepoId: 'repo-1', selectedWorktreePath: null } },
  );
  await screen.findByRole('tree', { name: 'Files' });
}

async function openAndEditA(): Promise<void> {
  await openFiles();
  fireEvent.click(await screen.findByRole('treeitem', { name: /^a\.ts$/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  await screen.findByTestId('code-editor');
}

async function typeInEditor(): Promise<void> {
  const { getCapturedMonacoEditorProps } = await import('../../../../test-support/module-mocks');
  getCapturedMonacoEditorProps().onChange?.('// edited\nconst answer = 42;\n');
}

beforeEach(() => {
  useFilesStore.setState({ scopeKey: null, expanded: {}, selectedPath: null, editing: null });
  useFileEditorStore.setState({
    target: null,
    savedContent: '',
    content: '',
    version: null,
    saving: false,
    saveError: null,
    staleWrite: false,
    pendingNav: null,
    allowClose: false,
  });
});

afterEach(cleanup);

describe('the file editor, assembled through the real bridge', () => {
  it('typing shows a dirty indicator, and Save clears it', async () => {
    await openAndEditA();

    await typeInEditor();
    expect(await screen.findByTitle('Unsaved changes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByTitle('Unsaved changes')).toBeNull());
  });

  it('leaving a dirty file for another shows the Save/Discard/Cancel guard', async () => {
    await openAndEditA();
    await typeInEditor();
    await screen.findByTitle('Unsaved changes');

    fireEvent.click(await screen.findByRole('treeitem', { name: /^b\.ts$/ }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Save changes to "a.ts"?');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Discard' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();

    // Discard proceeds with the blocked navigation.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /^b\.ts$/ }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
  });

  it('Cancel on the guard keeps the original file selected and the edit intact', async () => {
    await openAndEditA();
    await typeInEditor();
    await screen.findByTitle('Unsaved changes');

    fireEvent.click(await screen.findByRole('treeitem', { name: /^b\.ts$/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('treeitem', { name: /^a\.ts$/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    // Cancel keeps the edit — it neither saved nor discarded it.
    expect(screen.getByTitle('Unsaved changes')).toBeTruthy();
  });

  it('a stale write on Save offers Reload rather than overwriting or discarding silently', async () => {
    await openAndEditA();

    // Simulate an external change landing on disk after the read.
    (window as unknown as { __mstudioStaleFile: (relPath: string) => void }).__mstudioStaleFile(
      'a.ts',
    );

    await typeInEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/changed on disk/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
  });

  it('leaving edit mode (Done) returns focus to the Edit button, not <body>', async () => {
    await openAndEditA();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    const editButton = await screen.findByRole('button', { name: 'Edit' });
    expect(editButton).toBeTruthy();
    expect(document.activeElement).toBe(editButton);
  });
});
