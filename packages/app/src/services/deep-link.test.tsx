import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeepLink } from '@midnite/studio-shared';

import { DialogHost } from '../components/dialog-host';
import { ToastHost } from '../components/toast-host';
import { useToastStore } from '../store/toast-store';
import { useUiStore } from '../store/ui-store';
import { revealResource } from '../features/companion/reveal/reveal';
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
        // One open repository, whose remote is bilo-io/midnite-studio — the run tests' only known repo.
        list: vi.fn(async () => [{ id: 'repo:/tmp/known', path: '/tmp/known', name: 'known', headRef: 'main', worktrees: [] }]),
      },
      remotes: {
        list: vi.fn(async () => [
          { name: 'origin', fetchUrl: '', pushUrl: '', forge: { kind: 'github', host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio' } },
        ]),
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

vi.mock('../features/companion/reveal/reveal', () => ({ revealResource: vi.fn() }));

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

  it('a reveal link runs the engine with caller: link; an invalid ref is a toast', async () => {
    vi.mocked(revealResource).mockResolvedValue({ ok: true, did: 'revealed', label: 'PR 7' } as never);
    render(<Harness />, { wrapper });
    const ref = { kind: 'pull', repoId: 'repo:/r', number: 7 } as const;
    emit({ kind: 'reveal', ref }, false);
    expect(revealResource).toHaveBeenCalledWith(ref, { caller: 'link' });

    vi.mocked(revealResource).mockClear();
    emit({ kind: 'reveal', ref: null }, false);
    expect(revealResource).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0);
  });

  it('a view link (the launcher\'s tiles) lands on the view and media tab; a locked screen is a toast', () => {
    useUiStore.setState({ screensaverLocked: false, activeView: 'landing', mediaTab: 'doc' });
    emit({ kind: 'view', view: 'media', tab: 'game' }, false);
    expect(useUiStore.getState().activeView).toBe('media');
    expect(useUiStore.getState().mediaTab).toBe('game');

    useUiStore.setState({ screensaverLocked: true });
    emit({ kind: 'view', view: 'sessions' }, false);
    expect(useUiStore.getState().activeView).toBe('media');
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/locked/);
    useUiStore.setState({ screensaverLocked: false });
  });

  it('an agent run that failed validation in main is a toast, and nothing is asked or started', async () => {
    render(<Harness />, { wrapper });
    emit({ kind: 'run', run: null }, false);
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/isn't one Midnite can start/));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an agent run for a repository that is not open here is refused — never opened or cloned', async () => {
    render(<Harness />, { wrapper });
    emit({ kind: 'run', run: { issueUrl: 'https://github.com/someone-else/unknown/issues/1', skill: '/midnite-create' } }, false);
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/someone-else\/unknown isn't open/));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an agent run for an open repository asks first, naming the checkout', async () => {
    useUiStore.setState({ screensaverLocked: false, launchAndRunEnabled: false });
    render(<Harness />, { wrapper });
    emit({ kind: 'run', run: { issueUrl: 'https://github.com/bilo-io/midnite-studio/issues/42', skill: '/midnite-create' } }, false);
    expect(await screen.findByText('Run this task in an agent?', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText(/In \/tmp\/known/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });

  it('a settings link with a page selects that Settings page; a locked screen leaves it alone', () => {
    useUiStore.setState({ screensaverLocked: false, activeView: 'landing', settingsPage: 'appearance' });
    emit({ kind: 'view', view: 'settings', page: 'mcp' }, false);
    expect(useUiStore.getState().activeView).toBe('settings');
    expect(useUiStore.getState().settingsPage).toBe('mcp');

    useUiStore.setState({ screensaverLocked: true, activeView: 'landing' });
    emit({ kind: 'view', view: 'settings', page: 'monitor' }, false);
    expect(useUiStore.getState().activeView).toBe('landing');
    expect(useUiStore.getState().settingsPage).toBe('mcp');
    useUiStore.setState({ screensaverLocked: false });
  });
});

