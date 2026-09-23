import type { ForgeAccount, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { AccountsPage, PROVIDER_BRAND_COLOR, PROVIDER_ICON, PROVIDER_LABEL } from './accounts-page';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

function installBridge(overrides: Partial<MidniteStudioBridge['forgeAccounts']> = {}) {
  // `overrides` is spread last, so build the object once and hand back THAT
  // object's own methods — returning the pre-override locals instead (as a
  // first draft of this helper did) silently tracks the discarded default
  // mock rather than whichever one actually answers the bridge call.
  const forgeAccounts = {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    remove: vi.fn().mockResolvedValue({ ok: true }),
    switch: vi.fn().mockResolvedValue({ ok: true, activeAccountId: null }),
    capabilities: vi.fn(),
    reachableRepos: vi.fn().mockResolvedValue({ ok: false, reason: 'unsupported' }),
    ...overrides,
  } as MidniteStudioBridge['forgeAccounts'];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    forgeAccounts,
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
  });
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
  });
});
