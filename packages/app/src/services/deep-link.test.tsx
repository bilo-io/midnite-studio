import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeepLink } from '@midnite/studio-shared';

import { DialogHost } from '../components/dialog-host';
import { ToastHost } from '../components/toast-host';
import { useToastStore } from '../store/toast-store';
import { useUiStore } from '../store/ui-store';
import { useDeepLinks } from './deep-link';

const mocks = vi.hoisted(() => ({
  onDeepLink: null as ((e: { link: DeepLink; known: boolean }) => void) | null,
  openResult: { ok: true as const, repo: { id: 'repo:/tmp/proposed', path: '/tmp/proposed', name: 'proposed', headRef: 'main', worktrees: [] } } as
    | { ok: true; repo: { id: string; path: string; name: string; headRef: string | null; worktrees: unknown[] } }
    | { ok: false; message: string },
}));

vi.mock('./bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./bridge')>();
  return {
    ...actual,
    bridge: () => ({
      protocol: {
        onDeepLink: (handler: (e: { link: DeepLink; known: boolean }) => void) => {
          mocks.onDeepLink = handler;
          return () => {
            mocks.onDeepLink = null;
          };
        },
      },
      repos: {
        open: vi.fn().mockImplementation(async () => mocks.openResult),
      },
    }),
  };
});

function Harness() {
  useDeepLinks();
  return null;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastHost>
        <DialogHost>{children}</DialogHost>
      </ToastHost>
    </QueryClientProvider>
  );
}

const emit = (link: DeepLink, known: boolean) => {
  act(() => {
    mocks.onDeepLink?.({ link, known });
  });
};

describe('useDeepLinks', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedRepoId: null });
    useToastStore.setState({ toasts: [] });
    mocks.openResult = {
      ok: true,
      repo: { id: 'repo:/tmp/proposed', path: '/tmp/proposed', name: 'proposed', headRef: 'main', worktrees: [] },
    };
    render(<Harness />, { wrapper });
  });

  afterEach(() => cleanup());

  it('opens a known repo silently, with no dialog', () => {
    emit({ kind: 'open', repo: '/dev/known' }, true);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUiStore.getState().selectedRepoId).toBe('repo:/dev/known');
  });

  it('gates an unknown repo behind a consent dialog naming the path', () => {
    emit({ kind: 'open', repo: '/tmp/proposed' }, false);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('/tmp/proposed')).toBeDefined();
    expect(useUiStore.getState().selectedRepoId).toBeNull();
  });

  it('opens and selects the repo once the unknown-path proposal is confirmed', async () => {
    emit({ kind: 'open', repo: '/tmp/proposed' }, false);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => expect(useUiStore.getState().selectedRepoId).toBe('repo:/tmp/proposed'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never opens the repo when the proposal is cancelled', () => {
    emit({ kind: 'open', repo: '/tmp/proposed' }, false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUiStore.getState().selectedRepoId).toBeNull();
  });

  it('toasts an error rather than selecting anything when opening the proposal fails', async () => {
    mocks.openResult = { ok: false, message: 'Not a git repository.' };
    emit({ kind: 'open', repo: '/tmp/proposed' }, false);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Not a git repository.'),
    );
    expect(useUiStore.getState().selectedRepoId).toBeNull();
  });

  it('shows a clone link as a notice, never opening or cloning anything', () => {
    emit({ kind: 'clone', url: 'https://github.com/foo/bar.git' }, false);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/https:\/\/github\.com\/foo\/bar\.git/)).toBeDefined();
    expect(useUiStore.getState().selectedRepoId).toBeNull();
  });
});
