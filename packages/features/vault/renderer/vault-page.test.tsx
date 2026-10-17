// vitest/jsdom: DOM text, roles and the one-way write over a mock bridge.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { AGENT_SECRET_IDS } from '@midnite/studio-shared';

import { VaultPage } from './vault-page';

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

const account = {
  id: 'github:github.com:octo', kind: 'github', host: 'github.com', login: 'octo', displayName: 'octo',
  avatarUrl: null, addedAt: 1, hasToken: true, delegated: null,
};

function mount() {
  const secrets = {
    get: vi.fn(() => Promise.reject(new Error('Vault must never read a value'))),
    has: vi.fn(async ({ key }: { key: string }) => ({ hasKey: key === 'ollama.apiKey' })),
    set: vi.fn(async () => undefined),
  };
  const forgeAccounts = {
    list: vi.fn(async () => [account]),
    add: vi.fn(async () => ({ ok: true, account })),
    remove: vi.fn(async () => ({ ok: true })),
  };
  const db = {
    listConnections: vi.fn(async () => [{ id: 'c1', name: 'Prod', provider: 'postgres', host: 'db.example', database: 'app', username: 'svc' }]),
    deleteConnection: vi.fn(async () => ({ ok: true })),
  };
  let granted: Record<string, Record<string, '*'>> = {};
  const vaultGrants = {
    list: vi.fn(async () => ({ grants: granted, corrupt: false })),
    set: vi.fn(async (req: { appId: string; namespace: string }) => {
      granted = { ...granted, [req.appId]: { ...granted[req.appId], [req.namespace]: '*' } };
      return { ok: true };
    }),
    revoke: vi.fn(async (_req: { appId: string; namespace?: string }) => {
      granted = {};
      return { ok: true };
    }),
  };
  let paired = [{ appId: 'coder', pairedAt: 1, conflict: { at: 2, count: 3 } as { at: number; count: number } | null }];
  const vaultPairings = {
    list: vi.fn(async () => ({ apps: paired })),
    unpair: vi.fn(async (req: { appId: string }) => {
      paired = paired.filter((p) => p.appId !== req.appId);
      return { ok: true };
    }),
  };
  window.midniteStudio = { secrets, forgeAccounts, db, vaultGrants, vaultPairings } as unknown as typeof window.midniteStudio;
  const kit = createFrameChrome();
  render(
    <FrameChromeProvider chrome={kit.chrome}>
      <VaultPage />
      <kit.DialogHost />
    </FrameChromeProvider>,
  );
  return { secrets, forgeAccounts, db, vaultGrants, vaultPairings };
}

describe('VaultPage — paired apps', () => {
  it('shows a pairing conflict, and Unpair (confirmed) clears it', async () => {
    const { vaultPairings } = mount();
    const section = await screen.findByRole('region', { name: 'Paired apps' });
    await waitFor(() => expect(within(section).getByRole('alert').textContent).toMatch(/Pairing conflict — 3 refused/));
    fireEvent.click(within(section).getByRole('button', { name: 'Unpair' }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Unpair' }));
    await waitFor(() => expect(vaultPairings.unpair).toHaveBeenCalledWith({ appId: 'coder' }));
    await waitFor(() => expect(within(section).getByText('No app has paired yet.')).toBeDefined());
  });
});

describe('VaultPage', () => {
  it('lists secrets, accounts and logins as metadata, and never calls secrets.get', async () => {
    const { secrets } = mount();
    expect(await screen.findByText('octo')).toBeTruthy();
    expect(screen.getByText('Token stored')).toBeTruthy();
    expect(screen.getByText('Prod')).toBeTruthy();
    expect(screen.getByText(/postgres · db.example · svc/)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Not set')).toHaveLength(5 + AGENT_SECRET_IDS.length));
    expect(screen.getAllByText('Set', { selector: 'span' })).toHaveLength(1);
    expect(secrets.get).not.toHaveBeenCalled();
  });

  it('writes a new value one way through a password input', async () => {
    const { secrets } = mount();
    await screen.findByText('Rotate');
    fireEvent.click(screen.getAllByRole('button', { name: 'Set' })[0]!);
    const input = screen.getByLabelText(/New value for Twelve Data/) as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'td-123' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(secrets.set).toHaveBeenCalledWith({ key: 'finance.twelveData', value: 'td-123' });
    expect(screen.queryByDisplayValue('td-123')).toBeNull();
  });

  it('removes a secret only after the confirm', async () => {
    const { secrets } = mount();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Remove' }))[0]!);
    expect(secrets.set).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/secret value/);
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1)!));
    expect(secrets.set).toHaveBeenCalledWith({ key: 'ollama.apiKey', value: '' });
  });

  it('grants an app a namespace, and revokes only after the confirm', async () => {
    const { vaultGrants } = mount();
    const box = (await screen.findByLabelText('Allow browser to use Secrets')) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.queryByLabelText('Allow vault to use Secrets')).toBeNull();
    await act(async () => fireEvent.click(box));
    expect(vaultGrants.set).toHaveBeenCalledWith({ appId: 'browser', namespace: 'secrets', scope: '*' });
    await waitFor(() => expect((screen.getByLabelText('Allow browser to use Secrets') as HTMLInputElement).checked).toBe(true));
    fireEvent.click(screen.getByLabelText('Allow browser to use Secrets'));
    expect(vaultGrants.revoke).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' }).at(-1)!));
    expect(vaultGrants.revoke).toHaveBeenCalledWith({ appId: 'browser', namespace: 'secrets' });
  });

  it('lists LLM keys under their own heading and notes web-app sign-ins are not in the vault', async () => {
    mount();
    expect(await screen.findByText('Not in the vault yet')).toBeTruthy();
    expect(screen.getByText('LLM keys')).toBeTruthy();
    expect(screen.getByText('Claude API key')).toBeTruthy();
    expect(screen.queryByText(/LLM provider keys/)).toBeNull();
  });
});
