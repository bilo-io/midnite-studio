// vitest/jsdom: the credential components Studio's settings render through the vault's host port —
// DOM roles and the one-way writes, over a fake forge kit and a mock bridge.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import type { AgentDefinition, ForgeAccount, ForgeAccountAddResult } from '@midnite/studio-shared';

import { AgentKeyField } from './agent-key-field';
import { ForgeAccountAddForm, ForgeAccountRemoveButton } from './forge-account-credentials';
import { VaultHostProvider, type VaultAddForgeAccountInput, type VaultForgeKit, type VaultHost } from './host';

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

const Mark = () => <svg />;
const account: ForgeAccount = {
  id: 'gitlab:gitlab.com:octo', kind: 'gitlab', host: 'gitlab.com', login: 'octo', displayName: 'Octo',
  avatarUrl: null, addedAt: 1, hasToken: true, delegated: null,
};

function fakeKit(answer: ForgeAccountAddResult) {
  const add = vi.fn((_input: VaultAddForgeAccountInput) => answer);
  const remove = vi.fn((_id: string) => undefined);
  const kit: VaultForgeKit = {
    providers: [
      { kind: 'github', label: 'GitHub', host: 'github.com', tokenHint: 'gh scopes', Icon: Mark, brand: { light: '#000', dark: '#fff' } },
      { kind: 'gitlab', label: 'GitLab', host: 'gitlab.com', tokenHint: 'read_api', Icon: Mark, brand: { light: '#e24329', dark: '#fc6d26' } },
    ],
    // A react-query mutation in miniature: `data` is the last answer, `onSuccess` runs with it.
    useAddAccount: () => {
      const [data, setData] = useState<ForgeAccountAddResult | undefined>(undefined);
      return {
        isPending: false,
        data,
        mutate: (input, options) => {
          const result = add(input);
          setData(result);
          options?.onSuccess?.(result);
        },
      };
    },
    useRemoveAccount: () => ({ mutate: remove }),
  };
  return { kit, add, remove };
}

function mount(node: ReactNode, host: VaultHost) {
  const chrome = createFrameChrome();
  return render(
    <FrameChromeProvider chrome={chrome.chrome}>
      <VaultHostProvider host={host}>{node}</VaultHostProvider>
      <chrome.DialogHost />
    </FrameChromeProvider>,
  );
}

describe('ForgeAccountAddForm', () => {
  it('sends the token one way through the host kit, for the picked provider, and drops it on success', async () => {
    const { kit, add } = fakeKit({ ok: true, account });
    mount(<ForgeAccountAddForm />, { openWebApp: null, forge: kit });
    const form = screen.getByRole('form', { name: 'Add an account' });
    fireEvent.click(within(form).getByRole('radio', { name: 'GitLab' }));
    expect(within(form).getByRole('radio', { name: 'GitLab' }).getAttribute('aria-checked')).toBe('true');
    // A non-GitHub forge needs a token before it can be submitted.
    expect((within(form).getByRole('button', { name: 'Add GitLab account' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Personal access token'), { target: { value: '  glpat-123  ' } });
    await act(async () => fireEvent.submit(form));
    expect(add).toHaveBeenCalledWith({ kind: 'gitlab', host: 'gitlab.com', token: 'glpat-123' });
    expect(screen.queryByDisplayValue('glpat-123')).toBeNull();
  });

  it('shows the provider’s error and keeps the draft, so the user can correct it', async () => {
    const { kit } = fakeKit({ ok: false, error: 'GitLab rejected that token.' });
    mount(<ForgeAccountAddForm />, { openWebApp: null, forge: kit });
    fireEvent.click(screen.getByRole('radio', { name: 'GitLab' }));
    fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'bad' } });
    await act(async () => fireEvent.submit(screen.getByRole('form', { name: 'Add an account' })));
    expect(screen.getByRole('alert').textContent).toBe('GitLab rejected that token.');
    expect(screen.getByDisplayValue('bad')).toBeTruthy();
  });

  it('refuses to render without a host that composed a forge kit', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => mount(<ForgeAccountAddForm />, { openWebApp: null, forge: null })).toThrow(/forge kit/);
  });
});

describe('ForgeAccountRemoveButton', () => {
  it('removes the account through the host kit', () => {
    const { kit, remove } = fakeKit({ ok: true, account });
    mount(<ForgeAccountRemoveButton account={account} />, { openWebApp: null, forge: kit });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Octo' }));
    expect(remove).toHaveBeenCalledWith('gitlab:gitlab.com:octo');
  });
});

describe('AgentKeyField', () => {
  const agent = { id: 'claude', label: 'Claude', apiKeyEnvVar: 'ANTHROPIC_API_KEY' } as AgentDefinition;

  function bridgeWith(hasKey: boolean) {
    const secrets = {
      has: vi.fn(async () => ({ hasKey })),
      set: vi.fn(async () => undefined),
      get: vi.fn(() => Promise.reject(new Error('the field must never read a key back'))),
    };
    window.midniteStudio = { secrets } as unknown as typeof window.midniteStudio;
    return secrets;
  }

  it('is write-only: a password input, saved one way, never read back', async () => {
    const secrets = bridgeWith(false);
    mount(<AgentKeyField agent={agent} />, { openWebApp: null, forge: null });
    const input = (await screen.findByLabelText('Claude API Key')) as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'sk-ant-1' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Claude API Key' })));
    expect(secrets.set).toHaveBeenCalledWith({ key: 'agent.claude.apiKey', value: 'sk-ant-1' });
    expect(secrets.get).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('sk-ant-1')).toBeNull();
  });

  it('removes a stored key only after the confirm', async () => {
    const secrets = bridgeWith(true);
    mount(<AgentKeyField agent={agent} />, { openWebApp: null, forge: null });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Claude API Key' }));
    expect(secrets.set).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' })));
    await waitFor(() => expect(secrets.set).toHaveBeenCalledWith({ key: 'agent.claude.apiKey', value: '' }));
    expect(secrets.get).not.toHaveBeenCalled();
  });
});
