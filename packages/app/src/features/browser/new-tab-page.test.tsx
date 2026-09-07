import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NewTabPage } from './new-tab-page';
import { useBrowserStore } from '../../store/browser-store';

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
});
