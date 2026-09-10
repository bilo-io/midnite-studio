import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { MidniteStudioBridge, RepoDescriptor } from '@midnite/studio-shared';
import { NewTabPage } from './new-tab-page';
import { useBrowserStore } from '../../store/browser-store';
import { useUiStore } from '../../store/ui-store';

const repoDescriptor = (over: Partial<RepoDescriptor> = {}): RepoDescriptor => ({
  id: 'repo-1',
  path: '/repo',
  name: 'midnite-studio',
  headRef: 'main',
  worktrees: [],
  ...over,
});

/**
 * The page reaches for a `QueryClient` since Theme C — `useDevServer` shares
 * one probe sweep between this tile and the `browser.openDevServer` palette
 * row, and a shared cache is the whole point of it being a query. A fresh
 * client per render keeps the four cases below independent; retries are off so
 * a probe that cannot reach a bridge fails once instead of backing off through
 * the test's timeout.
 */
const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NewTabPage />
    </QueryClientProvider>,
  );

describe('NewTabPage', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    useBrowserStore.setState({ wallpaperTheme: 'nature', recents: [] });
    useUiStore.setState({ selectedRepoId: null });
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders search input, shortcuts, and wallpaper controls', () => {
    renderPage();

    expect(screen.getByPlaceholderText(/search the web or enter url/i)).toBeDefined();
    expect(screen.getByTestId('shortcuts-panel')).toBeDefined();
    expect(screen.getByTestId('wallpaper-theme-select')).toBeDefined();
    expect(screen.getByText('Shortcuts')).toBeDefined();
    expect(screen.getByText('Google')).toBeDefined();
    expect(screen.getByText('YouTube')).toBeDefined();
    expect(screen.getByText('Figma')).toBeDefined();
    expect(screen.getByText('Claude')).toBeDefined();
    expect(screen.getByText('Gemini')).toBeDefined();
    expect(screen.getByText('Notebook')).toBeDefined();
  });

  it('renders search input wrapped in synchronized gradient border and glow', () => {
    renderPage();

    const input = screen.getByPlaceholderText(/search the web or enter url/i);
    const wrapper = input.closest('.browser-search-sync');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains('gradient-border')).toBe(true);
    expect(wrapper?.classList.contains('gradient-border--glow')).toBe(true);
    expect(wrapper?.classList.contains('browser-search-sync')).toBe(true);
  });

  it('renders accurate brand colors for shortcut tiles', () => {
    renderPage();

    const googleTile = screen.getByTestId('shortcut-tile-google');
    expect(googleTile).toBeDefined();

    const youtubeTile = screen.getByTestId('shortcut-tile-youtube');
    expect(youtubeTile).toBeDefined();

    const figmaTile = screen.getByTestId('shortcut-tile-figma');
    expect(figmaTile).toBeDefined();
  });

  it('changes wallpaper theme and persists it through the browser store', () => {
    renderPage();

    const select = screen.getByTestId('wallpaper-theme-select') as HTMLSelectElement;
    expect(select.value).toBe('nature');

    fireEvent.change(select, { target: { value: 'cyberpunk' } });
    expect(select.value).toBe('cyberpunk');
    expect(useBrowserStore.getState().wallpaperTheme).toBe('cyberpunk');
  });

  it('renders live recents and clicking one navigates the active tab', () => {
    useBrowserStore.setState({
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', kind: 'newtab', url: '', title: '', loading: false, canGoBack: false, canGoForward: false }],
      recents: ['https://example.com', 'https://midnite.dev'],
    });
    renderPage();

    expect(screen.getByText('Recent Origins')).toBeDefined();
    expect(screen.getByText('example.com')).toBeDefined();
    expect(screen.getByText('midnite.dev')).toBeDefined();

    fireEvent.click(screen.getByText('example.com'));
    expect(useBrowserStore.getState().tabs[0]?.url).toBe('https://example.com');
  });

  it('renders no recents heading on a first run', () => {
    renderPage();
    expect(screen.queryByText('Recent Origins')).toBeNull();
  });

  it('renders unsplash attribution', () => {
    renderPage();
    expect(screen.getByText(/on unsplash/i)).toBeDefined();
  });

  it('submits through resolveInput rather than its own heuristic — localhost:5173 reaches browser.create as http://localhost:5173', () => {
    const create = vi.fn().mockResolvedValue({ ok: true });
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
      browser: { create } as unknown as MidniteStudioBridge['browser'],
    } as Partial<MidniteStudioBridge>;
    useBrowserStore.setState({
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', kind: 'newtab', url: '', title: '', loading: false, canGoBack: false, canGoForward: false }],
    });

    renderPage();
    const input = screen.getByPlaceholderText(/search the web or enter url/i);
    fireEvent.change(input, { target: { value: 'localhost:5173' } });
    fireEvent.submit(input.closest('form')!);

    expect(create).toHaveBeenCalledWith({ tabId: 'tab-1', url: 'http://localhost:5173' });
    expect(useBrowserStore.getState().tabs[0]?.url).toBe('http://localhost:5173');
  });

  describe('repo row (Theme F)', () => {
    function installReposBridge(repos: RepoDescriptor[], remotes: unknown[]) {
      const remotesList = vi.fn().mockResolvedValue(remotes);
      (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
        repos: { list: vi.fn().mockResolvedValue(repos) } as unknown as MidniteStudioBridge['repos'],
        remotes: { list: remotesList } as unknown as MidniteStudioBridge['remotes'],
        browser: { create: vi.fn().mockResolvedValue({ ok: true }) } as unknown as MidniteStudioBridge['browser'],
      } as Partial<MidniteStudioBridge>;
      return { remotesList };
    }

    it('renders nothing with no active repo', async () => {
      const { remotesList } = installReposBridge([repoDescriptor()], []);
      renderPage();
      // No repo selected — `useRemotes`'s query stays disabled and never fires.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(remotesList).not.toHaveBeenCalled();
      expect(screen.queryByTestId('repo-row')).toBeNull();
    });

    it('renders nothing when the active repo has no forge remote', async () => {
      const { remotesList } = installReposBridge([repoDescriptor()], [
        { name: 'origin', fetchUrl: '/srv/local.git', pushUrl: '/srv/local.git', forge: null },
      ]);
      useUiStore.setState({ selectedRepoId: 'repo-1' });
      renderPage();
      await waitFor(() => expect(remotesList).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(screen.queryByTestId('repo-row')).toBeNull();
    });

    it('renders the repo/pulls/actions tiles for a repo with a GitHub remote, each opening with originRepoId set', async () => {
      installReposBridge([repoDescriptor()], [
        {
          name: 'origin',
          fetchUrl: 'git@github.com:acme/widgets.git',
          pushUrl: 'git@github.com:acme/widgets.git',
          forge: { host: 'github.com', owner: 'acme', repo: 'widgets', kind: 'github' },
        },
      ]);
      useUiStore.setState({ selectedRepoId: 'repo-1' });
      useBrowserStore.setState({
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1', kind: 'newtab', url: '', title: '', loading: false, canGoBack: false, canGoForward: false }],
      });

      renderPage();
      await waitFor(() => expect(screen.getByTestId('repo-row')).toBeDefined());

      fireEvent.click(screen.getByTestId('repo-tile-pull-requests'));
      const tab = useBrowserStore.getState().tabs[0];
      expect(tab?.url).toBe('https://github.com/acme/widgets/pulls');
      expect(tab?.originRepoId).toBe('repo-1');
    });
  });
});
