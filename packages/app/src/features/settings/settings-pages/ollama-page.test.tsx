import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useModelsPullQueueStore } from '../../models/models-pull-queue-store';
import { OllamaSettingsPage } from './ollama-page';

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
  setTerminalOpen: vi.fn(),
  openSession: vi.fn(() => ({ id: 'session-1' })),
  queueInput: vi.fn(),
  setActiveView: vi.fn(),
}));

vi.mock('../../../services/queries', () => ({
  openExternal: mocks.openExternal,
}));

vi.mock('../../../store/ui-store', () => ({
  useUiStore: {
    getState: () => ({
      setTerminalOpen: mocks.setTerminalOpen,
      setActiveView: mocks.setActiveView,
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

type BridgeOverrides = {
  signedIn?: boolean;
  hasKey?: boolean;
  reachable?: boolean;
  searchItems?: { name: string; description?: string; capabilities?: string[]; variants?: string[] }[];
  installed?: string[];
  pullResult?: unknown;
};

function installBridge(over: BridgeOverrides = {}) {
  const search = vi.fn().mockResolvedValue({
    ok: true,
    value: { items: over.searchItems ?? [], stale: false, updatedAt: null },
  });
  const pull = vi
    .fn()
    .mockImplementation(async ({ model }: { model: string }) =>
      over.pullResult ?? { ok: true, value: { pullId: `pull-${model}`, model } },
    );
  const list = vi.fn().mockResolvedValue({
    ok: true,
    value: { models: (over.installed ?? []).map((model) => ({ name: model, model })) },
  });
  const signInStatus = vi.fn().mockResolvedValue({ signedIn: over.signedIn ?? false });
  const secretsHas = vi.fn().mockResolvedValue({ hasKey: over.hasKey ?? false });
  const secretsSet = vi.fn().mockResolvedValue(undefined);
  const bridge: Partial<MidniteStudioBridge> = {
    ollama: {
      status: vi
        .fn()
        .mockResolvedValue({ reachable: over.reachable ?? true, version: '0.5.0', host: 'http://127.0.0.1:11434' }),
      search,
      pull,
      list,
      onPullProgress: vi.fn(() => () => {}),
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
  return { signInStatus, secretsHas, secretsSet, search, pull };
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
  useModelsPullQueueStore.setState({ pulls: {} });
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

describe('OllamaSettingsPage — install a model', () => {
  const qwen = {
    name: 'qwen3',
    description: 'Dense and MoE models',
    capabilities: ['tools', 'thinking'],
    variants: ['8b', '14b'],
  };

  async function typeQuery(value: string) {
    const input = await screen.findByRole('combobox', { name: /install a model/i });
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
    return input;
  }

  it('lists one option per variant from the search, and marks installed ones', async () => {
    const { search } = installBridge({ searchItems: [qwen], installed: ['qwen3:8b'] });
    renderPage();

    const input = await typeQuery('qwen3');
    await screen.findByRole('option', { name: /qwen3:14b/ });
    expect(search).toHaveBeenCalledWith({ query: 'qwen3', scope: 'local' });
    expect(input.getAttribute('aria-expanded')).toBe('true');

    const installedOption = screen.getByRole('option', { name: /qwen3:8b/ });
    expect(installedOption.getAttribute('aria-disabled')).toBe('true');
    expect(installedOption.textContent).toMatch(/installed/i);
    expect(screen.getByRole('option', { name: /qwen3:14b/ }).getAttribute('aria-disabled')).toBeNull();
    // The typed text is not itself an option, so the free-text fallback is offered too.
    expect(screen.getByRole('option', { name: /pull “qwen3”/i })).toBeTruthy();
  });

  it('Enter pulls the highlighted option (skipping installed ones) and queues it', async () => {
    const { pull } = installBridge({ searchItems: [qwen], installed: ['qwen3:8b'] });
    renderPage();

    const input = await typeQuery('qwen3');
    await screen.findByRole('option', { name: /qwen3:14b/ });
    expect(input.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /qwen3:14b/ }).id,
    );
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(pull).toHaveBeenCalledWith({ model: 'qwen3:14b' }));
    await waitFor(() => expect(useModelsPullQueueStore.getState().pulls['pull-qwen3:14b']?.model).toBe('qwen3:14b'));
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('status').textContent).toMatch(/pulling qwen3:14b/i);

    fireEvent.click(screen.getByRole('button', { name: /view in models/i }));
    expect(mocks.setActiveView).toHaveBeenCalledWith('models');
  });

  it('ArrowDown moves the highlight and a click pulls that option', async () => {
    const { pull } = installBridge({ searchItems: [qwen] });
    renderPage();

    const input = await typeQuery('qwen3');
    const second = await screen.findByRole('option', { name: /qwen3:14b/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(second.id);

    fireEvent.click(screen.getByRole('option', { name: /qwen3:8b/ }));
    await waitFor(() => expect(pull).toHaveBeenCalledWith({ model: 'qwen3:8b' }));
  });

  it('the free-text fallback pulls the typed name when the search returns nothing', async () => {
    const { pull } = installBridge({ searchItems: [] });
    renderPage();

    await typeQuery('someone/custom-model:q4');
    fireEvent.click(await screen.findByRole('option', { name: /pull “someone\/custom-model:q4”/i }));

    await waitFor(() => expect(pull).toHaveBeenCalledWith({ model: 'someone/custom-model:q4' }));
  });

  it('Escape closes the listbox', async () => {
    installBridge({ searchItems: [qwen] });
    renderPage();

    const input = await typeQuery('qwen3');
    await screen.findByRole('option', { name: /qwen3:14b/ });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a pull failure inline', async () => {
    installBridge({ searchItems: [], pullResult: { ok: false, kind: 'error', message: 'daemon said no' } });
    renderPage();

    await typeQuery('llama3.2');
    fireEvent.click(await screen.findByRole('option', { name: /pull “llama3.2”/i }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/daemon said no/));
  });

  it('disables the field when Ollama is not reachable', async () => {
    installBridge({ reachable: false });
    renderPage();

    const input = await screen.findByRole('combobox', { name: /install a model/i });
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(true));
    expect(screen.getByText(/start ollama/i)).toBeTruthy();
  });
});
