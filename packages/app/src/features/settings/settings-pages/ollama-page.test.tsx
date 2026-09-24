import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OllamaSettingsPage } from './ollama-page';

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
  setTerminalOpen: vi.fn(),
  openSession: vi.fn(() => ({ id: 'session-1' })),
  queueInput: vi.fn(),
}));

vi.mock('../../../services/queries', () => ({
  openExternal: mocks.openExternal,
}));

vi.mock('../../../store/ui-store', () => ({
  useUiStore: {
    getState: () => ({
      setTerminalOpen: mocks.setTerminalOpen,
      selectedWorktreePath: '.',
      selectedRepoId: 'default',
    }),
  },
}));

vi.mock('../../terminal/terminal-store', () => ({
  useTerminalStore: {
    getState: () => ({
      openSession: mocks.openSession,
      queueInput: mocks.queueInput,
    }),
  },
}));

function installBridge(over: { signedIn?: boolean; hasKey?: boolean } = {}) {
  const signInStatus = vi.fn().mockResolvedValue({ signedIn: over.signedIn ?? false });
  const secretsHas = vi.fn().mockResolvedValue({ hasKey: over.hasKey ?? false });
  const secretsSet = vi.fn().mockResolvedValue(undefined);
  const bridge: Partial<MidniteStudioBridge> = {
    ollama: {
      status: vi.fn().mockResolvedValue({ reachable: true, version: '0.5.0', host: 'http://127.0.0.1:11434' }),
      settings: {
        get: vi.fn().mockResolvedValue({ host: null, defaultModel: null }),
        set: vi.fn(),
      },
      signInStatus,
    } as unknown as MidniteStudioBridge['ollama'],
    secrets: {
      get: vi.fn(),
      set: secretsSet,
      has: secretsHas,
    } as unknown as MidniteStudioBridge['secrets'],
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = bridge;
  return { signInStatus, secretsHas, secretsSet };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <OllamaSettingsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('OllamaSettingsPage — cloud sign-in', () => {
  it('shows "Not signed in" with a run-signin button when signed out', async () => {
    installBridge({ signedIn: false });
    renderPage();

    await waitFor(() => expect(screen.getByText(/not signed in/i)).toBeTruthy());
    const runButton = screen.getByRole('button', { name: /run ollama signin/i });
    fireEvent.click(runButton);

    expect(mocks.openSession).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'shell', title: 'ollama sign in' }),
    );
    expect(mocks.queueInput).toHaveBeenCalledWith('session-1', 'ollama signin\r');
  });

  it('shows signed-in state with no run-signin button', async () => {
    installBridge({ signedIn: true });
    renderPage();

    await waitFor(() => expect(screen.getByText(/signed in via/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /run ollama signin/i })).toBeNull();
  });
});

describe('OllamaSettingsPage — cloud API key', () => {
  it('shows a Save input when no key is set, and posts it via secrets.set', async () => {
    const { secretsSet } = installBridge({ hasKey: false });
    renderPage();

    const input = await screen.findByPlaceholderText(/paste an ollama.com api key/i);
    fireEvent.change(input, { target: { value: 'sk-test-123' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(secretsSet).toHaveBeenCalledWith({ key: 'ollama.apiKey', value: 'sk-test-123' }),
    );
  });

  it('shows "Key set" with a Clear button when a key is already set, and clears via an empty value', async () => {
    const { secretsSet } = installBridge({ hasKey: true });
    renderPage();

    await waitFor(() => expect(screen.getByText(/key set/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    await waitFor(() => expect(secretsSet).toHaveBeenCalledWith({ key: 'ollama.apiKey', value: '' }));
  });

  it('opens ollama.com/settings/keys via openExternal, never a terminal command', async () => {
    installBridge();
    renderPage();

    const link = await screen.findByRole('button', { name: /ollama.com\/settings\/keys/i });
    fireEvent.click(link);

    expect(mocks.openExternal).toHaveBeenCalledWith('https://ollama.com/settings/keys');
    expect(mocks.openSession).not.toHaveBeenCalled();
  });
});
