import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { activePanelBack } from '../../components/panel-stack/active-panel';
import { FilesView } from './files-view';
import { useFilesStore } from './files-store';
import { MarkdownPreview } from './preview/markdown-preview';

/**
 * Markdown-document history in the Files view. jsdom is enough: nothing here
 * needs real layout — scrolling is observed through spies on
 * `scrollIntoView`, and the store is the source of truth for the history.
 */
const listDir = vi.fn();

vi.mock('../../services/bridge', () => ({ bridge: () => ({ fs: { listDir } }) }));
vi.mock('../../services/queries', () => ({
  keys: { fs: (scope: unknown) => ['fs', JSON.stringify(scope)] },
  useRepos: () => ({ data: [{ id: 'repo-1', name: 'midnite-studio', path: '/tmp/repo' }] }),
}));
vi.mock('./file-tree', () => ({
  FileTree: ({ onSelectFile }: { onSelectFile: (p: string) => void }) => (
    <button onClick={() => onSelectFile('src/a.md')}>pick a</button>
  ),
}));
vi.mock('./preview/file-preview', () => ({
  FilePreview: ({ relPath }: { relPath: string }) => <div data-testid="file-preview">{relPath}</div>,
}));
vi.mock('./search-panel', () => ({
  SearchBar: () => null,
  SearchResults: () => null,
}));
vi.mock('./use-file-search', () => ({
  useFileSearch: () => ({ query: '', setQuery: vi.fn(), options: {}, setOptions: vi.fn(), state: null }),
}));

const initial = useFilesStore.getState();
const state = () => useFilesStore.getState();
const current = () => state().nav.entries[state().nav.index];

beforeEach(() => {
  useFilesStore.setState({ ...initial, scopeKey: 'k', selectedPath: null, expanded: {}, nav: { entries: [], index: -1 } });
  useUiStore.setState({ selectedRepoId: 'repo-1', selectedWorktreePath: null });
  listDir.mockResolvedValue({ ok: true, entries: [{ name: 'x.ts', kind: 'file' }] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DOC = '# Title\n\n[guide](./docs/GUIDE.md#setup)\n\n[up](../../escape.md)\n\n[code](./src/foo.ts)\n\n[jump](#second-part)\n\n## Second Part\n';

function preview(relPath = 'README.md') {
  return render(
    <MarkdownPreview
      content={DOC}
      label={relPath}
      currentRelPath={relPath}
      onNavigate={(p, a) => useFilesStore.getState().navigate(p, a ?? null)}
    />,
  );
}

describe('markdown link navigation', () => {
  it('a relative .md link opens the target (with its anchor) and pushes history', () => {
    state().navigate('README.md');
    preview();
    fireEvent.click(screen.getByText('guide'));
    expect(state().selectedPath).toBe('docs/GUIDE.md');
    expect(current()).toMatchObject({ relPath: 'docs/GUIDE.md', anchor: 'setup' });
    expect(state().nav.entries).toHaveLength(2);
    expect(state().expanded['docs']).toBe(true);
  });

  it('a non-markdown relative link opens that file too', () => {
    state().navigate('README.md');
    preview();
    fireEvent.click(screen.getByText('code'));
    expect(state().selectedPath).toBe('src/foo.ts');
    expect(state().nav.entries).toHaveLength(2);
  });

  it('rejects a link that climbs out of the repo root', () => {
    state().navigate('README.md');
    preview();
    fireEvent.click(screen.getByText('up'));
    expect(state().selectedPath).toBe('README.md');
    expect(state().nav.entries).toHaveLength(1);
  });

  it('an in-page anchor scrolls to its heading and pushes an entry', () => {
    state().navigate('README.md');
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    preview();
    fireEvent.click(screen.getByText('jump'));
    expect(current()).toMatchObject({ relPath: 'README.md', anchor: 'second-part' });
    expect(state().nav.entries).toHaveLength(2);
    expect(spy).toHaveBeenCalled();
  });
});

describe('history stack', () => {
  it('back restores the previous file and forward re-opens', () => {
    state().navigate('README.md');
    state().navigate('docs/GUIDE.md', 'setup');
    state().back();
    expect(state().selectedPath).toBe('README.md');
    state().forward();
    expect(state().selectedPath).toBe('docs/GUIDE.md');
    expect(state().restore.anchor).toBe('setup');
  });

  it('back restores the remembered scroll offset', () => {
    state().navigate('README.md');
    state().recordScroll(420);
    state().navigate('docs/GUIDE.md');
    state().back();
    expect(state().restore.scrollTop).toBe(420);
  });

  it('does not push a duplicate for the same file and anchor', () => {
    state().navigate('README.md');
    state().navigate('README.md');
    state().navigate('a.md', 'x');
    state().navigate('a.md', 'x');
    expect(state().nav.entries).toHaveLength(2);
  });

  it('selecting a file in the tree pushes history', () => {
    state().selectFile('a.md');
    state().selectFile('b.md');
    expect(state().nav.entries.map((e) => e.relPath)).toEqual(['a.md', 'b.md']);
  });
});

describe('FilesView controls', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );

  it('tree selection pushes; the Back button, mouse button 3 and panel.back walk it back', async () => {
    render(<FilesView />, { wrapper });
    const back = await screen.findByRole('button', { name: /^Back/ });
    const forward = screen.getByRole('button', { name: /^Forward/ });
    expect(back.hasAttribute('disabled')).toBe(true);

    state().navigate('README.md');
    fireEvent.click(await screen.findByText('pick a'));
    expect(screen.getByTestId('file-preview').textContent).toBe('src/a.md');
    expect(back.hasAttribute('disabled')).toBe(false);

    fireEvent.click(back);
    expect(screen.getByTestId('file-preview').textContent).toBe('README.md');
    expect(forward.hasAttribute('disabled')).toBe(false);

    fireEvent.click(forward);
    fireEvent.mouseUp(window, { button: 3 });
    expect(screen.getByTestId('file-preview').textContent).toBe('README.md');

    fireEvent.mouseUp(window, { button: 4 });
    expect(screen.getByTestId('file-preview').textContent).toBe('src/a.md');
    act(() => activePanelBack());
    expect(screen.getByTestId('file-preview').textContent).toBe('README.md');
  });
});
