import { beforeEach, describe, expect, it } from 'vitest';

import { useFilesStore } from './files-store';

const reset = () =>
  useFilesStore.setState({ scopeKey: null, expanded: {}, selectedPath: null, editing: null });

beforeEach(reset);

describe('files-store editing state', () => {
  it('startRename sets a rename edit', () => {
    useFilesStore.getState().startRename('src/app.ts', 'app.ts');
    expect(useFilesStore.getState().editing).toEqual({
      kind: 'rename',
      relPath: 'src/app.ts',
      initialName: 'app.ts',
    });
  });

  it('startCreate sets a create edit and force-expands its parent', () => {
    useFilesStore.getState().startCreate('src', 'file', 'Untitled');
    const state = useFilesStore.getState();
    expect(state.editing).toEqual({
      kind: 'create',
      parentPath: 'src',
      entryKind: 'file',
      initialName: 'Untitled',
    });
    expect(state.expanded.src).toBe(true);
  });

  it('startCreate at the root does not add a bogus "" expanded entry', () => {
    useFilesStore.getState().startCreate('', 'directory', 'New Folder');
    expect(useFilesStore.getState().expanded['']).toBeUndefined();
  });

  it('does not clobber an already-expanded parent', () => {
    useFilesStore.setState({ expanded: { src: true } });
    const before = useFilesStore.getState().expanded;
    useFilesStore.getState().startCreate('src', 'file', 'Untitled');
    expect(useFilesStore.getState().expanded).toBe(before); // same reference: no-op spread
  });

  it('cancelEdit clears whichever edit is open', () => {
    useFilesStore.getState().startRename('a.txt', 'a.txt');
    useFilesStore.getState().cancelEdit();
    expect(useFilesStore.getState().editing).toBeNull();
  });

  it('ensureScope resets editing along with expansion and selection', () => {
    useFilesStore.setState({ scopeKey: 'repo:1' });
    useFilesStore.getState().startRename('a.txt', 'a.txt');
    useFilesStore.getState().ensureScope('repo:2');
    expect(useFilesStore.getState().editing).toBeNull();
  });

  it('revealFile selects a root file without expanding extra dirs', () => {
    useFilesStore.getState().revealFile('README.md');
    const state = useFilesStore.getState();
    expect(state.selectedPath).toBe('README.md');
    expect(state.expanded).toEqual({});
  });

  it('revealFile selects a nested file and expands all ancestor directories', () => {
    useFilesStore.getState().revealFile('packages/app/src/main.tsx');
    const state = useFilesStore.getState();
    expect(state.selectedPath).toBe('packages/app/src/main.tsx');
    expect(state.expanded).toEqual({
      packages: true,
      'packages/app': true,
      'packages/app/src': true,
    });
  });
});
