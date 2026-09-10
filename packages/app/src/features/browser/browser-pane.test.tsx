import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { useBrowserStore } from '../../store/browser-store';
import { useUiStore } from '../../store/ui-store';
import { BrowserPane } from './browser-pane';

/** jsdom has no `ResizeObserver`; `useBrowserBounds` only needs it to exist. */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', StubResizeObserver);

let eventHandlers: ((event: unknown) => void)[] = [];
let setVisibleMock = vi.fn();

function pushBrowserEvent(event: unknown) {
  for (const handler of [...eventHandlers]) handler(event);
}

beforeEach(() => {
  eventHandlers = [];
  setVisibleMock = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: {
      setVisible: setVisibleMock,
      setBounds: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn(),
      navigate: vi.fn(),
      onEvent: vi.fn((handler: (event: unknown) => void) => {
        eventHandlers.push(handler);
        return () => {
          eventHandlers = eventHandlers.filter((h) => h !== handler);
        };
      }),
    } as unknown as MidniteStudioBridge['browser'],
  };
  useBrowserStore.setState({ tabs: [], activeTabId: null });
  useUiStore.setState({ browserOpen: true, browserLayout: 'full', occluders: 0 });
});

afterEach(cleanup);

/**
 * The tab strip reads the repo list for its preview-deploy chips, and its
 * per-tab menu asks `useDialogs` for a confirm — both are the app's own
 * ambient providers rather than anything these tests exercise.
 */
function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <DialogHost>{children}</DialogHost>
    </QueryClientProvider>
  );
}

const renderPane = () => render(<BrowserPane shown />, { wrapper });

const pane = () => screen.getByRole('dialog', { name: 'Browser' });

describe('BrowserPane layouts', () => {
  it('full screen stretches left over the nav rail, and stops above the footer', () => {
    renderPane();

    // `--nav-offset` is `@bilo-io/shell`'s own padding on `<main>` for the
    // fixed rail; pulling the left edge back by it is what puts the pane at
    // the window edge instead of the content edge. Read off the variable
    // rather than a literal so a locked-open 16rem rail is covered as
    // exactly as a collapsed 3.5rem one.
    expect(pane().getAttribute('style')).toContain('calc(-1 * var(--nav-offset, 0px))');
    // `inset-y-0`, not `inset-0`: the pane is bounded by the content row, and
    // the status bar is a sibling of that row — which is what leaves the
    // footer uncovered without the pane having to know how tall it is.
    expect(pane().className).toContain('inset-y-0');
    expect(pane().className).toContain('z-browser');
    expect(pane().className).not.toContain('inset-0');
  });

  it('side by side is not positioned at all — it fills the column app.tsx gives it', () => {
    useUiStore.setState({ browserLayout: 'left' });
    renderPane();

    expect(pane().className).toContain('relative');
    expect(pane().className).not.toContain('absolute');
    expect(pane().getAttribute('style')).not.toContain('--nav-offset');
  });

  it('the toolbar picker marks the current layout and switches without closing', () => {
    renderPane();

    expect(screen.getByTestId('browser-layout-pick-full').getAttribute('aria-pressed')).toBe(
      'true',
    );
    screen.getByTestId('browser-layout-pick-right').click();

    expect(useUiStore.getState()).toMatchObject({ browserOpen: true, browserLayout: 'right' });
  });
});

/** A page tab, active from the first render — the shape every chrome test below needs. */
function seedActivePageTab(url = 'https://example.com/page') {
  useBrowserStore.setState({
    tabs: [
      {
        id: 'tab-1',
        kind: 'page',
        url,
        title: '',
        loading: false,
        canGoBack: false,
        canGoForward: false,
      },
    ],
    activeTabId: 'tab-1',
  });
}

describe('a failed navigation (Theme G)', () => {
  it('renders the error page and hides the native view for its duration', async () => {
    seedActivePageTab();
    renderPane();
    setVisibleMock.mockClear();

    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -105, description: 'net::ERR_NAME_NOT_RESOLVED', validatedUrl: 'https://bad.example' },
    });

    expect(await screen.findByTestId('browser-error-page')).toBeDefined();
    expect(screen.getByText('net::ERR_NAME_NOT_RESOLVED')).toBeDefined();
    await waitFor(() =>
      expect(setVisibleMock).toHaveBeenLastCalledWith({ tabId: 'tab-1', visible: false }),
    );
  });

  it('gives the blocked-scheme code (-30) its own copy rather than a bare number', async () => {
    seedActivePageTab();
    renderPane();

    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -30, description: 'Blocked navigation to file: scheme', validatedUrl: 'file:///etc/passwd' },
    });

    expect(
      await screen.findByText('Midnite Studio only opens http and https pages here'),
    ).toBeDefined();
  });

  it('clears on the next did-start-loading', async () => {
    seedActivePageTab();
    renderPane();
    pushBrowserEvent({
      kind: 'failed',
      tabId: 'tab-1',
      error: { code: -105, description: 'net::ERR_NAME_NOT_RESOLVED', validatedUrl: 'https://bad.example' },
    });
    await screen.findByTestId('browser-error-page');

    pushBrowserEvent({ kind: 'loading', tabId: 'tab-1', loading: true });

    await waitFor(() => expect(screen.queryByTestId('browser-error-page')).toBeNull());
  });
});

describe('address bar behaviour (Theme G)', () => {
  const addressInput = () => screen.getByLabelText('Address') as HTMLInputElement;

  it('focus shows the full URL, selected', () => {
    seedActivePageTab('https://example.com/deep/path');
    renderPane();

    fireEvent.focus(addressInput());

    expect(addressInput().value).toBe('https://example.com/deep/path');
    expect(addressInput().selectionStart).toBe(0);
    expect(addressInput().selectionEnd).toBe('https://example.com/deep/path'.length);
  });

  it('blur with no edit shows the trimmed host + pathname', () => {
    seedActivePageTab('https://example.com/');
    renderPane();

    fireEvent.focus(addressInput());
    fireEvent.blur(addressInput());

    expect(addressInput().value).toBe('example.com');
  });

  it('typing previews the resolved destination', () => {
    seedActivePageTab();
    renderPane();

    fireEvent.focus(addressInput());
    fireEvent.change(addressInput(), { target: { value: 'midnite' } });

    expect(screen.getByText('https://www.google.com/search?q=midnite')).toBeDefined();
  });

  it('Escape restores the URL and blurs, without closing the pane', () => {
    seedActivePageTab('https://example.com/page');
    renderPane();

    fireEvent.focus(addressInput());
    fireEvent.change(addressInput(), { target: { value: 'something else entirely' } });
    fireEvent.keyDown(addressInput(), { key: 'Escape' });

    expect(addressInput().value).toBe('example.com/page');
    expect(pane()).toBeDefined();
    expect(useUiStore.getState().browserOpen).toBe(true);
  });

  it('renders fixed address bar wrapped in synchronized gradient border and glow', () => {
    seedActivePageTab();
    renderPane();

    const wrapper = addressInput().closest('.browser-search-sync');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains('gradient-border')).toBe(true);
    expect(wrapper?.classList.contains('gradient-border--glow')).toBe(true);
    expect(wrapper?.classList.contains('browser-search-sync')).toBe(true);
  });

  it('auto-focuses the fixed address bar on a new tab', async () => {
    useBrowserStore.setState({
      activeTabId: 'new-1',
      tabs: [{ id: 'new-1', kind: 'newtab', url: '', title: 'New tab', loading: false, canGoBack: false, canGoForward: false }],
    });
    renderPane();

    await waitFor(() => {
      expect(document.activeElement).toBe(addressInput());
    });
  });
});
