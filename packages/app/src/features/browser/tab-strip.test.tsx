import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useBrowserStore, type BrowserTab } from '../../store/browser-store';
import { BrowserTabStrip } from './tab-strip';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  portalTarget: null as HTMLDivElement | null,
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ windowRole: mocks.windowRole }),
}));

vi.mock('../../components/detached-window-frame', () => ({
  usePopoutHeaderActions: () => mocks.portalTarget,
}));

function tab(id: string, title: string): BrowserTab {
  return {
    id,
    kind: 'page',
    url: `https://example.com/${id}`,
    title,
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <DialogHost>{children}</DialogHost>
    </QueryClientProvider>
  );
}

const renderStrip = () => render(<BrowserTabStrip />, { wrapper });

beforeEach(() => {
  mocks.windowRole = 'main';
  mocks.portalTarget = null;
  useBrowserStore.setState({
    tabs: [tab('a', 'First tab'), tab('b', 'Second tab')],
    groups: [],
    activeTabId: 'a',
  });
});

afterEach(cleanup);

describe('BrowserTabStrip', () => {
  it('renders the full docked strip, including the hover-to-detach button', () => {
    renderStrip();

    expect(screen.getByRole('tablist', { name: 'Browser tabs' })).toBeDefined();
    expect(screen.getByLabelText('Detach Browser into its own window')).toBeDefined();
    expect(screen.getByText('First tab')).toBeDefined();
  });

  it('portals the whole strip into the title bar once popped out with a merged frame', () => {
    mocks.windowRole = 'browser';
    const portal = document.createElement('div');
    document.body.appendChild(portal);
    mocks.portalTarget = portal;

    renderStrip();

    // No strip at the panel's usual spot — it moved to the bar.
    expect(screen.queryByLabelText('Detach Browser into its own window')).toBeNull();
    expect(portal.querySelector('[role="tablist"]')).not.toBeNull();
    expect(portal.textContent).toContain('First tab');

    portal.remove();
  });

  it('falls back to the full docked strip when popped out but no merged frame exists', () => {
    mocks.windowRole = 'browser';
    mocks.portalTarget = null;

    renderStrip();

    expect(screen.getByRole('tablist', { name: 'Browser tabs' })).toBeDefined();
    // Detaching an already-detached window makes no sense — same guard as before.
    expect(screen.queryByLabelText('Detach Browser into its own window')).toBeNull();
    expect(screen.getByText('First tab')).toBeDefined();
  });
});
