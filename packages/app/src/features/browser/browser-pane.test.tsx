import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
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

beforeEach(() => {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: {
      setVisible: vi.fn(),
      setBounds: vi.fn(),
      create: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
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
