import type { ForgeAccount, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ForgeConnectStep } from './forge-connect-step';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function installBridge(overrides: Partial<MidniteStudioBridge['forgeAccounts']> = {}) {
  const forgeAccounts = {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    remove: vi.fn(),
    switch: vi.fn(),
    capabilities: vi.fn(),
    reachableRepos: vi.fn(),
    ...overrides,
  } as MidniteStudioBridge['forgeAccounts'];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    forgeAccounts,
  };
  return forgeAccounts;
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('ForgeConnectStep', () => {
  it('shows one card per supported provider', async () => {
    installBridge();
    render(<ForgeConnectStep />, { wrapper: createWrapper() });

    expect(await screen.findByText('GitHub')).toBeTruthy();
    expect(screen.getByText('GitLab')).toBeTruthy();
    expect(screen.getByText('Bitbucket')).toBeTruthy();
    expect(screen.getByText('Azure DevOps')).toBeTruthy();
  });

  it('lets GitHub connect with no token, but requires one for the other three', async () => {
    installBridge();
    render(<ForgeConnectStep />, { wrapper: createWrapper() });

    await screen.findByText('GitHub');
    const [githubConnect] = screen.getAllByRole('button', { name: 'Connect' });
    expect((githubConnect as HTMLButtonElement).disabled).toBe(false);

    const [gitlabToken] = screen.getAllByPlaceholderText('paste a token');
    if (!gitlabToken) throw new Error('expected a non-GitHub token field to render');
    const gitlabConnect = gitlabToken.closest('form')!.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(gitlabConnect.disabled).toBe(true);

    fireEvent.change(gitlabToken, { target: { value: 'glpat-abc' } });
    expect(gitlabConnect.disabled).toBe(false);
  });

  it('shows a connected card for an existing account instead of the form', async () => {
    const account: ForgeAccount = {
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
    installBridge({ list: vi.fn().mockResolvedValue([account]) });
    render(<ForgeConnectStep />, { wrapper: createWrapper() });

    expect(await screen.findByText('The Octocat')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
  });
});
