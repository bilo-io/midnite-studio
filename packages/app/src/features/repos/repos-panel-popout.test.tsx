import type { RepoDescriptor } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { ToastHost } from '../../components/toast-host';
import { ReposPanel } from './repos-panel';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  portalTarget: null as HTMLDivElement | null,
  repos: [] as RepoDescriptor[],
}));

vi.mock('../../services/bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/bridge')>();
  return {
    ...actual,
    bridge: () => ({
      windowRole: mocks.windowRole,
      fs: {
        listDir: vi.fn().mockResolvedValue({ ok: true, entries: [] }),
        readFile: vi.fn().mockResolvedValue({ ok: false }),
      },
    }),
  };
});

vi.mock('../../components/detached-window-frame', () => ({
  usePopoutHeaderActions: () => mocks.portalTarget,
}));

vi.mock('../../services/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/queries')>();
  return { ...actual, useRepos: () => ({ data: mocks.repos, isLoading: false }) };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastHost>
        <DialogHost>{children}</DialogHost>
      </ToastHost>
    </QueryClientProvider>
  );
}

const renderPanel = () => render(<ReposPanel />, { wrapper });

const sampleRepo: RepoDescriptor = {
  id: 'repo-1',
  name: 'midnite',
  path: '/dev/midnite',
  headRef: 'main',
  worktrees: [
    {
      id: 'repo-1:/dev/midnite',
      repoId: 'repo-1',
      path: '/dev/midnite',
      branch: 'main',
      headSha: 'deadbeef',
      locked: false,
      isMain: true,
      prunable: false,
    },
  ],
};

beforeEach(() => {
  mocks.windowRole = 'main';
  mocks.portalTarget = null;
  mocks.repos = [];
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

  it('renders filter repos input wrapped in gradient-border', () => {
    mocks.repos = [sampleRepo];
    renderPanel();

    const input = screen.getByPlaceholderText('Filter repos…');
    expect(input.parentElement?.classList.contains('gradient-border')).toBe(true);
  });

  it('adds pt-2 to filter input container only when popped out with a merged frame', () => {
    mocks.repos = [sampleRepo];

    // Docked mode
    const { unmount } = renderPanel();
    const filterInput = screen.getByPlaceholderText('Filter repos…');
    const container = filterInput.closest('div.px-3');
    expect(container?.classList.contains('pt-2')).toBe(false);
    unmount();

    // Popped out mode with portalTarget
    mocks.windowRole = 'repos';
    const portal = document.createElement('div');
    document.body.appendChild(portal);
    mocks.portalTarget = portal;

    renderPanel();
    const poppedFilterInput = screen.getByPlaceholderText('Filter repos…');
    const poppedContainer = poppedFilterInput.closest('div.px-3');
    expect(poppedContainer?.classList.contains('pt-2')).toBe(true);

    portal.remove();
  });
});
