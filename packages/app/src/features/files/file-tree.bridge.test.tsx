import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeFixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import type { FsScopeInput } from '../../services/queries';
import { FileTree } from './file-tree';
import { useFilesStore } from './files-store';

/**
 * Migrated from `e2e/files-write.spec.ts` (Phase 82 Theme C, wave 1) — the
 * Explorer's context menu, inline create/rename, delete-with-confirm and the
 * two free entries (Reveal in Finder, Copy Relative Path).
 *
 * Mounts `FileTree` directly rather than `FilesView` (the way the real app
 * reaches it, via clicking the Explorer rail link): `FileTree` is the whole
 * subject of every one of these tests, `expanded`/`selectedPath` live in the
 * module-level `useFilesStore` either way, and `FilesView`'s own root-listing
 * ladder is already covered by `files-view.test.tsx`. `TestExplorer` below is
 * the same small prop-plumbing `FilesView` does, trimmed to what these tests
 * need.
 */

const REPO_SCOPE: FsScopeInput = { scope: 'repo', repoId: 'repo-1' };
const CLAUDE_SCOPE: FsScopeInput = { scope: 'claude-home' };

/**
 * A fresh, deeply cloned tree every call, via `makeFixtures` (Phase 82 Theme
 * C's harness prerequisite) — `buildMockBridge` closes over whatever it is
 * given and its create/rename/delete handlers mutate `fsDirs`/`fsFiles` in
 * place (Phase 20's "a mocked write must mutate seeded state" rule).
 * Playwright gets that isolation for free — each test opens a fresh page,
 * and `installMockBridge`'s `addInitScript` structurally clones its argument
 * into it — but under jsdom `installMockBridgeJsdom` uses the object it is
 * handed directly, so the shared `fixtures` constant would carry one test's
 * rename/delete into the next. This file is `makeFixtures`'s original proof:
 * before it existed, this same isolation need was met by a hand-rolled
 * per-file function returning a fresh `{ ...fixtures, fsDirs: {…}, fsFiles:
 * {…} }` literal every call — exactly the one-off `makeFixtures` replaces.
 */
function writeFixtures() {
  return makeFixtures({
    fsDirs: {
      'repo:': [
        { name: 'src', kind: 'dir', size: 0, isIgnored: false },
        { name: 'README.md', kind: 'file', size: 120, isIgnored: false },
      ],
      'repo:src': [{ name: 'main.ts', kind: 'file', size: 64, isIgnored: false }],
    },
    fsFiles: {
      'repo:README.md': { kind: 'text', content: '# Midnite\n', size: 120 },
      'repo:src/main.ts': { kind: 'text', content: 'const answer = 42;\n', size: 64 },
    },
  });
}

function TestExplorer({ scope, writable }: { scope: FsScopeInput; writable?: boolean }) {
  const expanded = useFilesStore((s) => s.expanded);
  const selectedPath = useFilesStore((s) => s.selectedPath);
  return (
    <FileTree
      scope={scope}
      expanded={expanded}
      selectedPath={selectedPath}
      onToggleDir={(relPath) => useFilesStore.getState().toggleDir(relPath)}
      onSelectFile={(relPath) => useFilesStore.getState().selectFile(relPath)}
      writable={writable}
    />
  );
}

beforeEach(() => {
  useFilesStore.setState({ scopeKey: null, expanded: {}, selectedPath: null, editing: null });
});

afterEach(cleanup);

describe('FileTree, assembled through the real bridge', () => {
  it('right-click on a file offers New/Rename/Delete/Reveal/Copy', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });

    fireEvent.contextMenu(await screen.findByRole('treeitem', { name: 'README.md' }));

    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Reveal in Finder' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Copy Relative Path' })).toBeTruthy();
    // A file cannot contain children.
    expect(screen.queryByRole('menuitem', { name: 'New File' })).toBeNull();
  });

  it('right-click on empty tree space offers only New File/New Folder', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    await screen.findByRole('treeitem', { name: 'README.md' });

    fireEvent.contextMenu(screen.getByRole('tree', { name: 'Files' }));

    expect(screen.getByRole('menuitem', { name: 'New File' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'New Folder' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
  });

  it('New File creates an inline row, pre-filled and selected, that becomes a real entry on Enter', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    await screen.findByRole('treeitem', { name: 'README.md' });

    fireEvent.contextMenu(screen.getByRole('tree', { name: 'Files' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }));

    const input = screen.getByTestId('inline-name-input') as HTMLInputElement;
    expect(input.value).toBe('Untitled');
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'notes.md' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('treeitem', { name: 'notes.md' })).toBeTruthy();
  });

  it('creating a name that collides with a sibling shows an inline error and does not create it', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    await screen.findByRole('treeitem', { name: 'README.md' });

    fireEvent.contextMenu(screen.getByRole('tree', { name: 'Files' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }));

    const input = screen.getByTestId('inline-name-input');
    fireEvent.change(input, { target: { value: 'README.md' } });
    expect(screen.getByText('Already exists here')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter' });
    // Refused rather than round-tripped: still exactly one README.md row.
    expect(screen.getAllByRole('treeitem', { name: 'README.md' })).toHaveLength(1);
  });

  it('New Folder on a collapsed directory auto-expands it to show the inline row', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    const src = await screen.findByRole('treeitem', { name: 'src' });

    fireEvent.contextMenu(src);
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Folder' }));

    // `src` auto-expanded: its existing child is now visible alongside the
    // new inline row.
    expect(await screen.findByRole('treeitem', { name: 'main.ts' })).toBeTruthy();
    const input = screen.getByTestId('inline-name-input') as HTMLInputElement;
    expect(input.value).toBe('New Folder');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('treeitem', { name: 'New Folder' })).toBeTruthy();
  });

  it('Rename swaps the row for an inline input and commits on Enter', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    const readme = await screen.findByRole('treeitem', { name: 'README.md' });

    fireEvent.contextMenu(readme);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByTestId('inline-name-input') as HTMLInputElement;
    expect(input.value).toBe('README.md');
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'GUIDE.md' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('treeitem', { name: 'GUIDE.md' })).toBeTruthy();
    expect(screen.queryByRole('treeitem', { name: 'README.md' })).toBeNull();
  });

  it('Escape reverts a rename in progress, unchanged', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    const readme = await screen.findByRole('treeitem', { name: 'README.md' });

    fireEvent.contextMenu(readme);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByTestId('inline-name-input'), { target: { value: 'whatever' } });
    fireEvent.keyDown(screen.getByTestId('inline-name-input'), { key: 'Escape' });

    expect(await screen.findByRole('treeitem', { name: 'README.md' })).toBeTruthy();
  });

  it('deleting a file shows the uncommitted warning and removes the row on confirm', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    const readme = await screen.findByRole('treeitem', { name: 'README.md' });

    fireEvent.contextMenu(readme);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Delete "README.md"?');
    // A file's blast radius is a `warnings` line, not the commit-shaped
    // `blastRadius` field — the dialog must not read the latter's `undefined`
    // as "still being counted" and stick on this line forever.
    expect(dialog.textContent).not.toContain('Checking what this affects…');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'README.md' })).toBeNull());
  });

  it('deleting a directory counts its contents before showing the confirm', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    const src = await screen.findByRole('treeitem', { name: 'src' });

    fireEvent.contextMenu(src);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    // `src` holds one 64-byte file — the dirStats walk over the mock's own fsDirs.
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('1 file, 64 B'));
    expect(dialog.textContent).not.toContain('Checking what this affects…');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'src' })).toBeNull());
  });

  it('Reveal in Finder and Copy Relative Path record the row they were called on', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    const readme = await screen.findByRole('treeitem', { name: 'README.md' });

    fireEvent.contextMenu(readme);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal in Finder' }));
    await waitFor(() =>
      expect(
        (window as unknown as { __mstudioRevealedPaths: string[] }).__mstudioRevealedPaths,
      ).toEqual(['README.md']),
    );

    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'README.md' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Relative Path' }));
    await waitFor(() =>
      expect((window as unknown as { __mstudioClipboard: string[] }).__mstudioClipboard).toEqual([
        'README.md',
      ]),
    );
  });

  it('the hover ellipsis opens the same menu as right-click', async () => {
    renderView(<TestExplorer scope={REPO_SCOPE} writable />, { fixtures: writeFixtures() });
    await screen.findByRole('treeitem', { name: 'README.md' });

    fireEvent.click(screen.getByRole('button', { name: 'Actions for README.md' }));
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();
  });

  it("the Agent settings page's claude-home tree offers no context menu at all", async () => {
    renderView(<TestExplorer scope={CLAUDE_SCOPE} writable={false} />, {
      fixtures: makeFixtures({
        fsDirs: { 'claude:': [{ name: 'CLAUDE.md', kind: 'file', size: 10, isIgnored: false }] },
      }),
    });

    const row = await screen.findByRole('treeitem', { name: 'CLAUDE.md' });
    // Read-only by construction: `writable` defaults false, so this tree
    // never wires a context menu at all — nothing should appear, ever.
    fireEvent.contextMenu(row);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
