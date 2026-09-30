import type { ForgeAccount, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastHost } from '../../../components/toast-host';
import { AccountsPage } from './accounts-page';

/** Phase 98 Theme F — the accounts + identity page, over the existing account hooks. */
const ada: ForgeAccount = {
  id: 'github:github.com:ada',
  kind: 'github',
  host: 'github.com',
  login: 'ada',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  email: 'ada@forge.io',
  addedAt: 1,
  hasToken: false,
  delegated: 'gh',
};

function install(accounts: ForgeAccount[], identity = { name: 'Old Name', email: 'old@example.com' }) {
  const gitIdentity = {
    get: vi.fn().mockResolvedValue({ ok: true, value: identity }),
    set: vi.fn().mockImplementation(async (req: { name: string; email: string }) => ({ ok: true, value: req })),
  };
  const forgeAccounts = {
    list: vi.fn().mockResolvedValue(accounts),
    add: vi.fn(),
    remove: vi.fn(),
    switch: vi.fn().mockResolvedValue({ ok: true, activeAccountId: accounts[0]?.id ?? null }),
    capabilities: vi.fn(),
    reachableRepos: vi.fn(),
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    gitIdentity,
    forgeAccounts,
  } as unknown as Partial<MidniteStudioBridge>;
  return { gitIdentity, forgeAccounts };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastHost>
        <AccountsPage />
      </ToastHost>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('AccountsPage', () => {
  it('shows a card per account with name, login and email', async () => {
    install([ada]);
    renderPage();
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText(/@ada · ada@forge.io/)).toBeTruthy();
  });

  it('says when an account shared no email', async () => {
    install([{ ...ada, email: null }]);
    renderPage();
    expect(await screen.findByText(/email not shared/)).toBeTruthy();
  });

  it('starts from the current git config', async () => {
    install([]);
    renderPage();
    await waitFor(() => expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Old Name'));
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('old@example.com');
  });

  it('selecting a card switches the account and prefills the form, then saves globally', async () => {
    const { gitIdentity, forgeAccounts } = install([ada]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/ }));
    await waitFor(() => expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@forge.io'));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ada Lovelace');
    expect(forgeAccounts.switch).toHaveBeenCalledWith({ id: ada.id });

    fireEvent.click(screen.getByRole('button', { name: 'Set as git identity' }));
    await waitFor(() =>
      expect(gitIdentity.set).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@forge.io' }),
    );
    expect(await screen.findByText(/Saved to your global git config/)).toBeTruthy();
  });

  it('keeps the save button off for an invalid email and shows a failed write', async () => {
    const { gitIdentity } = install([]);
    gitIdentity.set.mockResolvedValue({ ok: false, kind: 'error', message: 'read-only home' });
    renderPage();
    const email = await screen.findByLabelText('Email');
    fireEvent.change(email, { target: { value: 'nope' } });
    const button = screen.getByRole('button', { name: 'Set as git identity' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(email, { target: { value: 'ok@example.com' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toContain('read-only home');
  });
});
