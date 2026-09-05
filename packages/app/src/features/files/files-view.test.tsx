import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { FilesView } from './files-view';

/**
 * The Explorer's ROOT listing, and its three states — Phase 60 Theme C.
 *
 * The root is the level worth separating from `DirectoryChildren`'s own
 * per-folder handling: its failures are about the whole view rather than about
 * one folder — a checkout deleted or a worktree moved leaves every row missing
 * — and before this ladder existed that rendered as an empty tree with nothing
 * said.
 */
const listDir = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ fs: { listDir } }),
}));

vi.mock('../../services/queries', () => ({
  keys: { fs: (scope: unknown) => ['fs', JSON.stringify(scope)] },
  useRepos: () => ({ data: [{ id: 'repo-1', name: 'midnite-studio', path: '/tmp/repo' }] }),
}));

vi.mock('./file-tree', () => ({
  FileTree: () => <div data-testid="file-tree" />,
}));

vi.mock('./preview/file-preview', () => ({
  FilePreview: () => <div data-testid="file-preview" />,
}));

vi.mock('./search-panel', () => ({
  SearchBar: () => <div data-testid="search-bar" />,
  SearchResults: () => <div data-testid="search-results" />,
}));

vi.mock('./use-file-search', () => ({
  useFileSearch: () => ({ query: '', setQuery: vi.fn(), options: {}, setOptions: vi.fn(), state: null }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useUiStore.setState({ selectedRepoId: 'repo-1', selectedWorktreePath: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const showing = (): string[] =>
  Object.entries({
    noRepo: screen.queryByText('No repository selected'),
    error: screen.queryByText('Could not read this checkout'),
    empty: screen.queryByText('Nothing here'),
    skeleton: screen.queryByText('Reading this checkout…'),
    content: screen.queryByTestId('file-tree'),
  })
    .filter(([, node]) => node !== null)
    .map(([name]) => name);

describe('FilesView — the root listing’s three states', () => {
  it('asks for a repository before anything else', () => {
    useUiStore.setState({ selectedRepoId: null });
    listDir.mockResolvedValue({ ok: true, entries: [] });
    render(<FilesView />, { wrapper });
    expect(showing()).toEqual(['noRepo']);
  });

  it('shows the skeleton — not the empty tree — while the first listing is out', () => {
    listDir.mockReturnValue(new Promise(() => {}));
    render(<FilesView />, { wrapper });
    expect(showing()).toEqual(['skeleton']);
  });

  it('shows the failure, carrying the listing’s own message', async () => {
    listDir.mockResolvedValue({ ok: false, message: 'ENOENT: no such directory' });
    render(<FilesView />, { wrapper });
    await waitFor(() => expect(showing()).toEqual(['error']));
    expect(screen.getByText('ENOENT: no such directory')).toBeTruthy();
  });

  it('shows the empty state for a checkout with nothing at its root', async () => {
    listDir.mockResolvedValue({ ok: true, entries: [] });
    render(<FilesView />, { wrapper });
    await waitFor(() => expect(showing()).toEqual(['empty']));
  });

  it('shows the tree once there is something in it', async () => {
    listDir.mockResolvedValue({ ok: true, entries: [{ kind: 'file', name: 'README.md' }] });
    render(<FilesView />, { wrapper });
    await waitFor(() => expect(showing()).toEqual(['content']));
  });
});
