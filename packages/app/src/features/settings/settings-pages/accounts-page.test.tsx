import type { ForgeAccount, MidniteStudioBridge, RepoDescriptor } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAccountSwitcherStore } from '../../../components/account-switcher-store';
import { ToastHost } from '../../../components/toast-host';
import { useUiStore } from '../../../store/ui-store';
import { AccountsPage, PROVIDER_BRAND_COLOR, PROVIDER_ICON, PROVIDER_LABEL } from './accounts-page';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Wrapped in `<ToastHost>`: `useSwitchForgeAccount`'s own `onSuccess` (the
// follow-up to Theme L that toasts what a switch hid) reaches `useToasts()`,
// which throws "must be used inside <ToastHost>" on mount otherwise.
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastHost>{children}</ToastHost>
    </QueryClientProvider>
  );
}

const gitlabAccount: ForgeAccount = {
  id: 'gitlab:gitlab.com:octocat',
  kind: 'gitlab',
  host: 'gitlab.com',
  login: 'octocat',
  displayName: 'The Octocat',
  avatarUrl: null,
  addedAt: 0,
  hasToken: true,
  delegated: null,
};

const githubAccount: ForgeAccount = {
  id: 'github:github.com:bilo-io',
  kind: 'github',
  host: 'github.com',
  login: 'bilo-io',
  displayName: '',
  avatarUrl: null,
  addedAt: 0,
  hasToken: false,
  delegated: 'gh',
};

const repo = (id: string): RepoDescriptor => ({
  id,
  path: `/r/${id}`,
  name: id,
  headRef: 'main',
  worktrees: [],
});

function installBridge(
  overrides: Partial<MidniteStudioBridge['forgeAccounts']> = {},
  extra: { repos?: RepoDescriptor[]; remotes?: Record<string, { host: string; owner: string; kind: 'github' | 'gitlab' }> } = {},
) {
  // `overrides` is spread last, so build the object once and hand back THAT
  // object's own methods — returning the pre-override locals instead (as a
  // first draft of this helper did) silently tracks the discarded default
  // mock rather than whichever one actually answers the bridge call.
  const forgeAccounts = {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    switch: vi.fn(async ({ id }: { id: string | null }) => ({ ok: true, activeAccountId: id })),
    capabilities: vi.fn(),
    reachableRepos: vi.fn().mockResolvedValue({ ok: false, reason: 'unsupported' }),
    ...overrides,
  } as MidniteStudioBridge['forgeAccounts'];
  const remotesByRepo = extra.remotes ?? {};
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    forgeAccounts,
    repos: {
      list: vi.fn().mockResolvedValue(extra.repos ?? []),
    } as unknown as MidniteStudioBridge['repos'],
    remotes: {
      list: vi.fn(async ({ repoId }: { repoId: string }) => {
        const r = remotesByRepo[repoId];
        if (!r) return [];
        const url = `https://${r.host}/${r.owner}/${repoId}.git`;
        return [
          {
            name: 'origin',
            fetchUrl: url,
            pushUrl: url,
            forge: { host: r.host, owner: r.owner, repo: repoId, kind: r.kind },
          },
        ];
      }),
    } as unknown as MidniteStudioBridge['remotes'],
  } as Partial<MidniteStudioBridge>;
  return forgeAccounts;
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({
    forgeAccounts: [],
    forgeActiveAccountId: null,
    forgeScopeReposToActiveAccount: true,
    forgeSyncGhAuthSwitch: true,
    forgeSwitcherPlacement: 'titlebar-right',
  });
  useAccountSwitcherStore.setState({ addFormPending: false });
});

describe('AccountsPage', () => {
  it('shows the empty state with no accounts', async () => {
    installBridge();
    render(<AccountsPage />, { wrapper: createWrapper() });
    expect(await screen.findByText(/No accounts yet/)).toBeTruthy();
  });

  it('renders a stored account row', async () => {
    installBridge({ list: vi.fn().mockResolvedValue([gitlabAccount]) });
    render(<AccountsPage />, { wrapper: createWrapper() });
    expect(await screen.findByText('The Octocat')).toBeTruthy();
    expect(screen.getByText(/gitlab · gitlab\.com/)).toBeTruthy();
  });

  it('requires a token for a non-GitHub provider before the add button enables', async () => {
    installBridge();
    render(<AccountsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('radio', { name: 'GitLab' }));
    const submit = screen.getByRole('button', { name: /Add GitLab account/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('paste a token'), { target: { value: 'glpat-abc' } });
    expect(submit.disabled).toBe(false);
  });

  it('allows adding a GitHub account with no token typed', async () => {
    installBridge();
    render(<AccountsPage />, { wrapper: createWrapper() });
    const submit = (await screen.findByRole('button', { name: /Add GitHub account/ })) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('shows the returned error and does not clear the token field on a rejected add', async () => {
    const { add } = installBridge({
      add: vi.fn().mockResolvedValue({ ok: false, error: 'Could not verify this token.' }),
    });
    const { container } = render(<AccountsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('radio', { name: 'GitLab' }));
    fireEvent.change(screen.getByPlaceholderText('paste a token'), { target: { value: 'bad-token' } });
    // `fireEvent.click` on the submit button doesn't reliably trigger a
    // native form submission under jsdom; submitting the form directly still
    // exercises the same `onSubmit` handler under test.
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(add).toHaveBeenCalledWith({ kind: 'gitlab', host: 'gitlab.com', token: 'bad-token' }));
    expect(await screen.findByText('Could not verify this token.')).toBeTruthy();
    expect((screen.getByPlaceholderText('paste a token') as HTMLInputElement).value).toBe('bad-token');
  });

  it('calls remove when the trash button is clicked', async () => {
    const { remove } = installBridge({ list: vi.fn().mockResolvedValue([gitlabAccount]) });
    render(<AccountsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByLabelText('Remove The Octocat'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ id: gitlabAccount.id }));
  });

  // Phase 90 Theme C — the two account-switching settings this page is
  // `persisted-keys.ts`'s named home for.
  it('toggles forgeScopeReposToActiveAccount', async () => {
    installBridge();
    render(<AccountsPage />, { wrapper: createWrapper() });
    const checkbox = (await screen.findByText(
      "Hide repos that don't belong to the active account",
    )).previousSibling as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(useUiStore.getState().forgeScopeReposToActiveAccount).toBe(false);
  });

  it('toggles forgeSyncGhAuthSwitch', async () => {
    installBridge();
    render(<AccountsPage />, { wrapper: createWrapper() });
    const checkbox = (await screen.findByText(
      'Run `gh auth switch` when the active GitHub account changes',
    )).previousSibling as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(useUiStore.getState().forgeSyncGhAuthSwitch).toBe(false);
  });

  it('shows no reachable-repos section with no active account', async () => {
    installBridge({ list: vi.fn().mockResolvedValue([gitlabAccount]) });
    render(<AccountsPage />, { wrapper: createWrapper() });
    await screen.findByText('The Octocat');
    expect(screen.queryByText('Reachable repositories')).toBeNull();
  });

  it("shows an unsupported message for the active account's kind", async () => {
    installBridge({
      list: vi.fn().mockResolvedValue([gitlabAccount]),
      reachableRepos: vi.fn().mockResolvedValue({ ok: false, reason: 'unsupported' }),
    });
    useUiStore.setState({ forgeActiveAccountId: gitlabAccount.id });
    render(<AccountsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Reachable repositories' }));
    expect(await screen.findByText(/isn't available for GitLab yet/)).toBeTruthy();
  });

  it('lists the active account’s reachable repos with a Clone button each', async () => {
    const githubAccount: ForgeAccount = { ...gitlabAccount, id: 'github:github.com:octocat', kind: 'github' };
    installBridge({
      list: vi.fn().mockResolvedValue([githubAccount]),
      reachableRepos: vi.fn().mockResolvedValue({
        ok: true,
        repos: [
          { owner: 'octocat', name: 'hello-world', fullName: 'octocat/hello-world', url: 'https://github.com/octocat/hello-world.git', private: false },
        ],
      }),
    });
    useUiStore.setState({ forgeActiveAccountId: githubAccount.id });
    render(<AccountsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Reachable repositories' }));
    expect(await screen.findByText('octocat/hello-world')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clone…' })).toBeTruthy();
  });

  // Ad hoc: brand-coloured forge provider picker.
  describe('provider brand colours', () => {
    it('defines a light and dark colour, plus an icon, for every supported provider', () => {
      for (const kind of Object.keys(PROVIDER_LABEL) as (keyof typeof PROVIDER_LABEL)[]) {
        const brand = PROVIDER_BRAND_COLOR[kind];
        expect(brand.light).toMatch(HEX_COLOR);
        expect(brand.dark).toMatch(HEX_COLOR);
        expect(PROVIDER_ICON[kind]).toBeTruthy();
      }
    });

    it("swaps GitHub's near-black for a light fallback in dark mode, unlike the other providers", () => {
      expect(PROVIDER_BRAND_COLOR.github.light).not.toBe(PROVIDER_BRAND_COLOR.github.dark);
      expect(PROVIDER_BRAND_COLOR.gitlab.light).toBe(PROVIDER_BRAND_COLOR.gitlab.dark);
      expect(PROVIDER_BRAND_COLOR.bitbucket.light).toBe(PROVIDER_BRAND_COLOR.bitbucket.dark);
      expect(PROVIDER_BRAND_COLOR.azure.light).toBe(PROVIDER_BRAND_COLOR.azure.dark);
    });

    it('carries each provider’s brand colour as CSS custom properties on its picker option, tinted only when selected', async () => {
      installBridge();
      render(<AccountsPage />, { wrapper: createWrapper() });

      const gitlabOption = await screen.findByRole('radio', { name: 'GitLab' });
      expect(gitlabOption.style.getPropertyValue('--brand-light')).toBe(PROVIDER_BRAND_COLOR.gitlab.light);
      expect(gitlabOption.style.getPropertyValue('--brand-dark')).toBe(PROVIDER_BRAND_COLOR.gitlab.dark);
      // Unselected by default (GitHub is): no brand-tinted border/background yet.
      expect(gitlabOption.style.borderColor).toBe('');
      expect(gitlabOption.style.background).toBe('');

      fireEvent.click(gitlabOption);
      expect(gitlabOption.getAttribute('aria-checked')).toBe('true');
      expect(gitlabOption.style.borderColor).toContain('color-mix');
      expect(gitlabOption.style.borderColor).toContain('var(--forge-brand)');
      expect(gitlabOption.style.background).toContain('color-mix');
      expect(gitlabOption.style.background).toContain('var(--forge-brand)');
    });

    it("renders each provider's own brand icon, tinted with --forge-brand, inside its picker option", async () => {
      installBridge();
      render(<AccountsPage />, { wrapper: createWrapper() });

      for (const label of Object.values(PROVIDER_LABEL)) {
        const option = await screen.findByRole('radio', { name: label });
        const icon = option.querySelector('svg');
        expect(icon, `${label} option should render an svg icon`).toBeTruthy();
        expect(icon!.getAttribute('aria-hidden')).toBe('true');
        expect(icon!.getAttribute('style')).toContain('var(--forge-brand)');
      }
    });
  });

  // Phase 90 Theme L.
  describe('account switcher', () => {
    it('offers every placement and writes the chosen one to forgeSwitcherPlacement', async () => {
      installBridge();
      render(<AccountsPage />, { wrapper: createWrapper() });
      const select = (await screen.findByRole('combobox', {
        name: 'Account switcher placement',
      })) as HTMLSelectElement;
      expect(select.value).toBe('titlebar-right');
      expect(Array.from(select.options).map((o) => o.value)).toEqual([
        'titlebar-right',
        'titlebar-left',
        'rail-top',
        'rail-bottom',
        'hidden',
      ]);
      fireEvent.change(select, { target: { value: 'rail-bottom' } });
      expect(useUiStore.getState().forgeSwitcherPlacement).toBe('rail-bottom');
    });

    it('focuses the add form when the switcher asked for it, and consumes the request', async () => {
      installBridge();
      useAccountSwitcherStore.getState().requestAddForm();
      render(<AccountsPage />, { wrapper: createWrapper() });
      const selected = await screen.findByRole('radio', { name: 'GitHub' });
      await waitFor(() => expect(document.activeElement).toBe(selected));
      expect(useAccountSwitcherStore.getState().addFormPending).toBe(false);
    });

    it('leaves focus alone when no add-form request is pending', async () => {
      installBridge();
      render(<AccountsPage />, { wrapper: createWrapper() });
      await screen.findByRole('radio', { name: 'GitHub' });
      expect(document.activeElement).toBe(document.body);
    });
  });

  // The follow-up to Theme L (PR #516): the switch itself shipped without
  // the "toast what it hid, with an undo" the phase doc's Decisions section
  // asks for. `useSwitchForgeAccount` (`services/queries.ts`) owns the
  // toast, so `AccountsPage`'s "Make active" button is one of its three
  // entry points, not a re-implementation.
  describe('account-switch toast', () => {
    it('Make active toasts the hidden-repos count, with an Undo back to the previous account', async () => {
      installBridge(
        { list: vi.fn().mockResolvedValue([gitlabAccount, githubAccount]) },
        {
          repos: [repo('on-a'), repo('on-b')],
          remotes: {
            'on-a': { host: 'gitlab.com', owner: 'octocat', kind: 'gitlab' },
            'on-b': { host: 'github.com', owner: 'bilo-io', kind: 'github' },
          },
        },
      );
      useUiStore.setState({ forgeActiveAccountId: gitlabAccount.id });
      render(<AccountsPage />, { wrapper: createWrapper() });

      // Only the non-active account (github) has a "Make active" button —
      // gitlab's own row reads "Active" instead.
      await screen.findByText('bilo-io');
      fireEvent.click(screen.getByRole('button', { name: 'Make active' }));

      const toast = await screen.findByRole('status');
      expect(toast.textContent).toContain('Switched to bilo-io (github) · 1 repository hidden');

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(useUiStore.getState().forgeActiveAccountId).toBe(gitlabAccount.id));
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    });
  });
});
