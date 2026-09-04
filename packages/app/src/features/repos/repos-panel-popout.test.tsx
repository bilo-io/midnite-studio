import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { ReposPanel } from './repos-panel';

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

vi.mock('../../services/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/queries')>();
  return { ...actual, useRepos: () => ({ data: [], isLoading: false }) };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <DialogHost>{children}</DialogHost>
    </QueryClientProvider>
  );
}

const renderPanel = () => render(<ReposPanel />, { wrapper });

beforeEach(() => {
  mocks.windowRole = 'main';
  mocks.portalTarget = null;
});

afterEach(cleanup);

describe('ReposPanel popout header merge', () => {
  it('renders the full docked header, including the hover-to-detach mark', () => {
    renderPanel();

    expect(screen.getByText('Git Repos')).toBeDefined();
    expect(screen.getByLabelText('Detach Git Repos into its own window')).toBeDefined();
    expect(screen.getByLabelText('Open a repository…')).toBeDefined();
  });

  it('portals the toolbar into the title bar once popped out with a merged frame', () => {
    mocks.windowRole = 'repos';
    const portal = document.createElement('div');
    document.body.appendChild(portal);
    mocks.portalTarget = portal;

    renderPanel();

    // "Git Repos" no longer renders here at all — it's `DetachedWindowFrame`'s
    // `left` slot now, which this test does not mount.
    expect(screen.queryByText('Git Repos')).toBeNull();
    expect(screen.queryByLabelText('Detach Git Repos into its own window')).toBeNull();
    expect(portal.querySelector('[aria-label="Open a repository…"]')).not.toBeNull();

    portal.remove();
  });

  it('falls back to the full docked header when popped out but no merged frame exists', () => {
    mocks.windowRole = 'repos';
    mocks.portalTarget = null;

    renderPanel();

    expect(screen.getByText('Git Repos')).toBeDefined();
    expect(screen.queryByLabelText('Detach Git Repos into its own window')).toBeNull();
    expect(screen.getByLabelText('Open a repository…')).toBeDefined();
  });
});
