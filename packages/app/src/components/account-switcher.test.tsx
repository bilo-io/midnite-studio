import type { ForgeAccount, MidniteStudioBridge, RepoDescriptor } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FORGE_SWITCHER_PLACEMENTS, useUiStore, type ForgeSwitcherPlacement } from '../store/ui-store';
import { AccountSwitcher, AccountSwitcherSlot } from './account-switcher';
import { openAccountsSettings, useAccountSwitcherStore } from './account-switcher-store';

/**
 * Phase 90 Theme L — the account switcher. All jsdom: rows, roles, store
 * writes and slot selection are DOM facts, not layout ones (docs/TESTING.md).
 * Appearance is the visual lane's (`e2e/visual/account-switcher.visual.ts`).
 */

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const gitlab: ForgeAccount = {
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

const github: ForgeAccount = {
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

/** `on-github` has a github.com remote, `on-gitlab` one owned by the gitlab account. */
const REMOTES: Record<string, { host: string; owner: string; kind: 'github' | 'gitlab' }> = {
  'on-github': { host: 'github.com', owner: 'someone', kind: 'github' },
  'on-gitlab': { host: 'gitlab.com', owner: 'octocat', kind: 'gitlab' },
};

function installBridge({
  accounts = [gitlab, github],
  repos = [] as RepoDescriptor[],
}: { accounts?: ForgeAccount[]; repos?: RepoDescriptor[] } = {}) {
  const forgeAccounts = {
    list: vi.fn().mockResolvedValue(accounts),
    add: vi.fn(),
    remove: vi.fn(),
    switch: vi.fn(async ({ id }: { id: string | null }) => ({ ok: true, activeAccountId: id })),
    capabilities: vi.fn(),
    reachableRepos: vi.fn().mockResolvedValue({ ok: false, reason: 'unsupported' }),
  } as unknown as MidniteStudioBridge['forgeAccounts'];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    forgeAccounts,
    repos: { list: vi.fn().mockResolvedValue(repos) } as unknown as MidniteStudioBridge['repos'],
    remotes: {
      list: vi.fn(async ({ repoId }: { repoId: string }) => {
        const r = REMOTES[repoId];
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

function setAccounts(accounts: ForgeAccount[], activeId: string | null) {
  useUiStore.setState({ forgeAccounts: accounts, forgeActiveAccountId: activeId });
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({
    forgeAccounts: [],
    forgeActiveAccountId: null,
    forgeScopeReposToActiveAccount: true,
    forgeSwitcherPlacement: 'titlebar-right',
    activeView: 'graph',
  });
  useAccountSwitcherStore.setState({ openRequest: 0, addFormPending: false });
});

async function openMenu(name: RegExp = /switch account/) {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('menu');
}

describe('AccountSwitcher — the menu', () => {
  it('lists one row per account, with its host, and checks only the active one', async () => {
    installBridge();
    setAccounts([gitlab, github], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    const menu = await openMenu();
    const rows = within(menu).getAllByRole('menuitemradio');
    expect(rows).toHaveLength(2);

    const active = within(menu).getByRole('menuitemradio', { name: 'The Octocat' });
    expect(active.getAttribute('aria-checked')).toBe('true');
    expect(within(active).getByText('gitlab.com')).toBeTruthy();
    expect(active.querySelector('[data-provider="gitlab"]')).toBeTruthy();

    // No display name: the login stands in. A gh-delegated account says so.
    const other = within(menu).getByRole('menuitemradio', { name: 'bilo-io' });
    expect(other.getAttribute('aria-checked')).toBe('false');
    expect(within(other).getByText('github.com · via gh')).toBeTruthy();
  });

  it('tints each provider badge through the brand-colour custom properties', async () => {
    installBridge();
    setAccounts([gitlab, github], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    const menu = await openMenu();
    const badge = menu.querySelector<SVGElement>('[data-provider="gitlab"] svg');
    expect(badge?.getAttribute('class')).toContain('forge-provider-option');
    expect(badge?.style.getPropertyValue('--brand-light')).toBe('#FC6D26');
    expect(badge?.style.color).toBe('var(--forge-brand)');
  });

  it('switches through useSwitchForgeAccount with the clicked id, and closes', async () => {
    const api = installBridge();
    setAccounts([gitlab, github], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'bilo-io' }));

    await waitFor(() => expect(api.switch).toHaveBeenCalledWith({ id: github.id }));
    await waitFor(() => expect(useUiStore.getState().forgeActiveAccountId).toBe(github.id));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not re-switch to the account that is already active', async () => {
    const api = installBridge();
    setAccounts([gitlab, github], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'The Octocat' }));
    expect(api.switch).not.toHaveBeenCalled();
  });

  it('ends with Add account… (add form requested) and Manage accounts…', async () => {
    installBridge();
    setAccounts([gitlab], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    let menu = await openMenu();
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Add account…', 'Manage accounts…']);

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Manage accounts…' }));
    expect(useUiStore.getState().activeView).toBe('settings');
    expect(useUiStore.getState().settingsPage).toBe('accounts');
    expect(useAccountSwitcherStore.getState().addFormPending).toBe(false);

    menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Add account…' }));
    expect(useAccountSwitcherStore.getState().addFormPending).toBe(true);
  });

  it('clicking the button while the menu is open closes it', async () => {
    installBridge();
    setAccounts([gitlab], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    await openMenu();
    const button = screen.getByRole('button', { name: /switch account/ });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('AccountSwitcher — hidden-repos line', () => {
  it('is absent when nothing is out of scope for the active account', async () => {
    installBridge({ repos: [repo('on-gitlab')] });
    setAccounts([gitlab], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    const menu = await openMenu();
    // Give the remote fan-out a chance to land before asserting absence.
    await waitFor(() =>
      expect(
        (window as unknown as { midniteStudio: MidniteStudioBridge }).midniteStudio.remotes.list,
      ).toHaveBeenCalled(),
    );
    expect(within(menu).queryByRole('menuitemcheckbox')).toBeNull();
  });

  it('shows the count for N > 0 and its toggle flips forgeScopeReposToActiveAccount', async () => {
    installBridge({ repos: [repo('on-github'), repo('on-gitlab')] });
    setAccounts([gitlab], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    let menu = await openMenu();
    const toggle = await within(menu).findByRole('menuitemcheckbox', {
      name: "Hide other accounts' repos",
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(within(toggle).getByText('1 repository hidden for this account')).toBeTruthy();

    fireEvent.click(toggle);
    expect(useUiStore.getState().forgeScopeReposToActiveAccount).toBe(false);

    // Still reachable with scoping off — otherwise the menu could only ever
    // turn it off.
    menu = await openMenu();
    const off = await within(menu).findByRole('menuitemcheckbox');
    expect(off.getAttribute('aria-checked')).toBe('false');
    expect(within(off).getByText('1 repository outside this account')).toBeTruthy();
    fireEvent.click(off);
    expect(useUiStore.getState().forgeScopeReposToActiveAccount).toBe(true);
  });
});

describe('AccountSwitcher — zero accounts', () => {
  it('renders an Add account placeholder that goes straight to the add form', async () => {
    installBridge({ accounts: [] });
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });

    const button = await screen.findByRole('button', { name: 'Add account' });
    expect(button.getAttribute('aria-haspopup')).toBeNull();
    fireEvent.click(button);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(useUiStore.getState().activeView).toBe('settings');
    expect(useUiStore.getState().settingsPage).toBe('accounts');
    expect(useAccountSwitcherStore.getState().addFormPending).toBe(true);
  });

  it('shows the same placeholder as a labelled row in the expanded rail', async () => {
    installBridge({ accounts: [] });
    render(<AccountSwitcher layout="rail" expanded />, { wrapper: createWrapper() });
    const row = await screen.findByRole('button', { name: 'Add account' });
    expect(row.textContent).toContain('Add account');
  });
});

describe('AccountSwitcher — rail layout', () => {
  it('prints the name beside the avatar while expanded, and only the avatar collapsed', async () => {
    installBridge();
    setAccounts([gitlab], gitlab.id);
    const { rerender } = render(<AccountSwitcher layout="rail" expanded />, {
      wrapper: createWrapper(),
    });
    const row = await screen.findByRole('button', { name: /switch account/ });
    expect(row.textContent).toContain('The Octocat');

    rerender(<AccountSwitcher layout="rail" expanded={false} />);
    expect(screen.getByRole('button', { name: /switch account/ }).textContent).not.toContain(
      'The Octocat',
    );
  });
});

describe('AccountSwitcherSlot — placement', () => {
  const SLOTS = ['titlebar-right', 'titlebar-left', 'rail-top', 'rail-bottom'] as const;

  function renderAllSlots() {
    return render(
      <>
        {SLOTS.map((slot) => (
          <div key={slot} data-testid={`slot-${slot}`}>
            <AccountSwitcherSlot slot={slot} expanded />
          </div>
        ))}
      </>,
      { wrapper: createWrapper() },
    );
  }

  it.each(FORGE_SWITCHER_PLACEMENTS.filter((p) => p !== 'hidden'))(
    '%s mounts exactly one switcher, in that slot',
    async (placement) => {
      installBridge();
      setAccounts([gitlab], gitlab.id);
      useUiStore.setState({ forgeSwitcherPlacement: placement });
      renderAllSlots();

      await screen.findByRole('button', { name: /switch account/ });
      expect(document.querySelectorAll('[data-account-switcher]')).toHaveLength(1);
      const inSlot = screen
        .getByTestId(`slot-${placement}`)
        .querySelector('[data-account-switcher]');
      expect(inSlot?.getAttribute('data-account-switcher')).toBe(
        placement.startsWith('rail') ? 'rail' : 'titlebar',
      );
    },
  );

  it("'hidden' mounts none", () => {
    installBridge();
    setAccounts([gitlab], gitlab.id);
    useUiStore.setState({ forgeSwitcherPlacement: 'hidden' });
    renderAllSlots();
    expect(document.querySelectorAll('[data-account-switcher]')).toHaveLength(0);
  });

  it('moves when the setting changes, never showing two', async () => {
    installBridge();
    setAccounts([gitlab], gitlab.id);
    renderAllSlots();
    await screen.findByRole('button', { name: /switch account/ });
    for (const placement of ['rail-bottom', 'titlebar-left'] as ForgeSwitcherPlacement[]) {
      act(() => useUiStore.setState({ forgeSwitcherPlacement: placement }));
      expect(document.querySelectorAll('[data-account-switcher]')).toHaveLength(1);
      expect(
        screen.getByTestId(`slot-${placement}`).querySelector('[data-account-switcher]'),
      ).toBeTruthy();
    }
  });
});

describe('account.switcher.open request', () => {
  it('opens the mounted switcher’s menu', async () => {
    installBridge();
    setAccounts([gitlab], gitlab.id);
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });
    await screen.findByRole('button', { name: /switch account/ });
    expect(screen.queryByRole('menu')).toBeNull();

    act(() => useAccountSwitcherStore.getState().requestOpen());
    expect(await screen.findByRole('menu')).toBeTruthy();
  });

  it('does not replay a request made before the switcher mounted', async () => {
    installBridge();
    setAccounts([gitlab], gitlab.id);
    useAccountSwitcherStore.getState().requestOpen();
    render(<AccountSwitcher layout="titlebar" />, { wrapper: createWrapper() });
    await screen.findByRole('button', { name: /switch account/ });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('openAccountsSettings navigates without requesting the add form unless asked', () => {
    openAccountsSettings();
    expect(useUiStore.getState().settingsPage).toBe('accounts');
    expect(useAccountSwitcherStore.getState().addFormPending).toBe(false);
    openAccountsSettings({ focusAddForm: true });
    expect(useAccountSwitcherStore.getState().addFormPending).toBe(true);
  });
});
