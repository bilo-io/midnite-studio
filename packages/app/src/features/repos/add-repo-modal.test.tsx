import type {
  ForgeAccount,
  MidniteStudioBridge,
  ReachableRepo,
  RepoDescriptor,
} from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastHost } from '../../components/toast-host';
import { useUiStore } from '../../store/ui-store';
import { __resetAddRepoModalStateForTests, AddRepoModal } from './add-repo-modal';

// `<AccountSwitcher>` is rendered inside the clone-list step ("switch
// accounts here too") and its menu reaches `useToasts()` on a switch —
// wrapped exactly like `accounts-page.test.tsx` for the same reason.
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastHost>{children}</ToastHost>
    </QueryClientProvider>
  );
}

const githubAccount: ForgeAccount = {
  id: 'github:github.com:octocat',
  kind: 'github',
  host: 'github.com',
  login: 'octocat',
  displayName: 'The Octocat',
  avatarUrl: null,
  addedAt: 0,
  hasToken: false,
  delegated: 'gh',
};

const reachable: ReachableRepo = {
  owner: 'octocat',
  name: 'hello-world',
  fullName: 'octocat/hello-world',
  url: 'https://github.com/octocat/hello-world.git',
  private: false,
};

const existingRepo: RepoDescriptor = {
  id: 'repo-1',
  path: '/Users/bilo/Dev/midnite-studio',
  name: 'midnite-studio',
  headRef: 'main',
  worktrees: [],
};

type ReachableAnswer =
  | ReachableRepo[]
  | { unsupported: true }
  | { error: string };

function installBridge(
  overrides: {
    accounts?: ForgeAccount[];
    reachableRepos?: ReachableAnswer;
    repos?: RepoDescriptor[];
    pickDirectoryResult?: string | null;
    cloneResult?: { ok: true; repo: RepoDescriptor } | { ok: false; message: string };
    openResult?: { ok: true; repo: RepoDescriptor } | { ok: false; message: string };
  } = {},
) {
  const reachableRepos = overrides.reachableRepos;
  const reachableAnswer =
    reachableRepos === undefined || (!Array.isArray(reachableRepos) && 'unsupported' in reachableRepos)
      ? { ok: false as const, reason: 'unsupported' as const }
      : Array.isArray(reachableRepos)
        ? { ok: true as const, repos: reachableRepos }
        : { ok: false as const, reason: 'error' as const, message: reachableRepos.error };

  const clone = vi.fn().mockResolvedValue(overrides.cloneResult ?? { ok: true, repo: existingRepo });
  const open = vi.fn().mockResolvedValue(overrides.openResult ?? { ok: true, repo: existingRepo });
  const pickDirectory = vi.fn().mockResolvedValue(overrides.pickDirectoryResult ?? null);

  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    forgeAccounts: {
      list: vi.fn().mockResolvedValue(overrides.accounts ?? []),
      add: vi.fn(),
      remove: vi.fn(),
      switch: vi.fn(async ({ id }: { id: string | null }) => ({ ok: true, activeAccountId: id })),
      capabilities: vi.fn(),
      reachableRepos: vi.fn().mockResolvedValue(reachableAnswer),
    } as unknown as MidniteStudioBridge['forgeAccounts'],
    repos: {
      list: vi.fn().mockResolvedValue(overrides.repos ?? []),
      open,
      clone,
      pickDirectory,
    } as unknown as MidniteStudioBridge['repos'],
  } as Partial<MidniteStudioBridge>;

  return { clone, open, pickDirectory };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({
    forgeAccounts: [],
    forgeActiveAccountId: null,
    activeView: 'graph',
    settingsPage: 'appearance',
  });
  __resetAddRepoModalStateForTests();
});

describe('AddRepoModal', () => {
  it('offers Clone a repo and Local repo', async () => {
    installBridge();
    render(<AddRepoModal onClose={vi.fn()} />, { wrapper: createWrapper() });
    expect(await screen.findByRole('button', { name: /Clone a repo/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Local repo/ })).toBeTruthy();
  });

  it('closes on the header close button', async () => {
    const onClose = vi.fn();
    installBridge();
    render(<AddRepoModal onClose={onClose} />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  describe('clone path — no account connected', () => {
    it('prompts to connect a forge account instead of an empty list', async () => {
      const onClose = vi.fn();
      installBridge();
      render(<AddRepoModal onClose={onClose} />, { wrapper: createWrapper() });
      fireEvent.click(await screen.findByRole('button', { name: /Clone a repo/ }));
      expect(await screen.findByText(/No forge account connected/)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Connect a forge account…' }));
      expect(useUiStore.getState().activeView).toBe('settings');
      expect(useUiStore.getState().settingsPage).toBe('accounts');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('clone path — account connected', () => {
    function renderWithAccount(overrides: Parameters<typeof installBridge>[0] = {}) {
      const bridge = installBridge({
        accounts: [githubAccount],
        reachableRepos: [reachable],
        repos: [existingRepo],
        ...overrides,
      });
      useUiStore.setState({ forgeActiveAccountId: githubAccount.id });
      const onClose = vi.fn();
      render(<AddRepoModal onClose={onClose} />, { wrapper: createWrapper() });
      return { onClose, ...bridge };
    }

    it("lists the active account's reachable repos, each with a Clone… action", async () => {
      renderWithAccount();
      fireEvent.click(await screen.findByRole('button', { name: /Clone a repo/ }));
      expect(await screen.findByText('octocat/hello-world')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Clone…' })).toBeTruthy();
    });

    it('shows an unsupported message for a kind with no reachable-repos listing', async () => {
      renderWithAccount({ reachableRepos: { unsupported: true } });
      fireEvent.click(await screen.findByRole('button', { name: /Clone a repo/ }));
      expect(await screen.findByText(/isn't available for GitHub yet/)).toBeTruthy();
    });

    it('defaults the clone destination to the parent of an existing repo, showing the full path', async () => {
      renderWithAccount();
      fireEvent.click(await screen.findByRole('button', { name: /Clone a repo/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Clone…' }));
      expect((await screen.findByTestId('clone-destination-path')).textContent).toBe(
        '/Users/bilo/Dev/hello-world',
      );
    });

    it('lets the user choose a different destination folder', async () => {
      const { pickDirectory } = renderWithAccount({ pickDirectoryResult: '/tmp/custom' });
      fireEvent.click(await screen.findByRole('button', { name: /Clone a repo/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Clone…' }));
      await screen.findByTestId('clone-destination-path');

      fireEvent.click(screen.getByRole('button', { name: 'Choose a different folder…' }));
      await waitFor(() => expect(pickDirectory).toHaveBeenCalled());
      expect((await screen.findByTestId('clone-destination-path')).textContent).toBe(
        '/tmp/custom/hello-world',
      );
    });

    it('clones to the shown destination and closes the modal on success', async () => {
      const { onClose, clone } = renderWithAccount();
      fireEvent.click(await screen.findByRole('button', { name: /Clone a repo/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Clone…' }));
      await screen.findByTestId('clone-destination-path');

      fireEvent.click(screen.getByRole('button', { name: 'Clone' }));
      await waitFor(() =>
        expect(clone).toHaveBeenCalledWith({
          destDir: '/Users/bilo/Dev',
          url: reachable.url,
          name: reachable.name,
        }),
      );
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('shows a clone error inline and keeps the modal open', async () => {
      const { onClose } = renderWithAccount({
        cloneResult: { ok: false, message: 'Could not clone: authentication failed.' },
      });
      fireEvent.click(await screen.findByRole('button', { name: /Clone a repo/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Clone…' }));
      await screen.findByTestId('clone-destination-path');
      fireEvent.click(screen.getByRole('button', { name: 'Clone' }));

      expect(await screen.findByText('Could not clone: authentication failed.')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('goes back from the destination step to the repo list', async () => {
      renderWithAccount();
      fireEvent.click(await screen.findByRole('button', { name: /Clone a repo/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Clone…' }));
      await screen.findByTestId('clone-destination-path');

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(await screen.findByText('octocat/hello-world')).toBeTruthy();
    });
  });

  describe('local repo tile', () => {
    it('opens the native picker, opens the folder, and closes the modal on success', async () => {
      const { open, pickDirectory } = installBridge({ pickDirectoryResult: '/tmp/pick' });
      const onClose = vi.fn();
      render(<AddRepoModal onClose={onClose} />, { wrapper: createWrapper() });

      fireEvent.click(await screen.findByRole('button', { name: /Local repo/ }));
      await waitFor(() => expect(pickDirectory).toHaveBeenCalled());
      await waitFor(() => expect(open).toHaveBeenCalledWith({ path: '/tmp/pick' }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('stays open with nothing opened when the native dialog is cancelled', async () => {
      const { open } = installBridge({ pickDirectoryResult: null });
      const onClose = vi.fn();
      render(<AddRepoModal onClose={onClose} />, { wrapper: createWrapper() });

      fireEvent.click(await screen.findByRole('button', { name: /Local repo/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Local repo/ })).toBeTruthy());
      expect(open).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('shows an inline error and keeps the modal open on a failed open', async () => {
      installBridge({
        pickDirectoryResult: '/tmp/pick',
        openResult: { ok: false, message: 'Not a git repository.' },
      });
      const onClose = vi.fn();
      render(<AddRepoModal onClose={onClose} />, { wrapper: createWrapper() });

      fireEvent.click(await screen.findByRole('button', { name: /Local repo/ }));
      expect(await screen.findByText('Not a git repository.')).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
