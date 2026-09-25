import type { MidniteStudioBridge, OllamaSearchResultItem } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PullModelField } from './pull-model-field';
import { useModelsPullQueueStore } from './models-pull-queue-store';

function searchResult(over: Partial<OllamaSearchResultItem> = {}): OllamaSearchResultItem {
  return {
    name: 'llama3.1',
    variants: ['8b', '70b'],
    ...over,
  };
}

function installBridge(over: {
  searchItems?: OllamaSearchResultItem[];
  showOk?: boolean;
  showMessage?: string;
} = {}) {
  const show = vi.fn().mockResolvedValue(
    over.showOk === false
      ? { ok: false, kind: 'error', message: over.showMessage ?? 'not found' }
      : { ok: true, value: { capabilities: [] } },
  );
  const pull = vi.fn().mockResolvedValue({ ok: true, value: { pullId: 'p1', model: 'llama3.1:8b' } });
  const search = vi.fn().mockResolvedValue({
    ok: true,
    value: { items: over.searchItems ?? [searchResult()], stale: false, updatedAt: 'now' },
  });
  const bridge: Partial<MidniteStudioBridge> = {
    ollama: {
      status: vi.fn().mockResolvedValue({ reachable: true, version: '0.5', host: 'http://127.0.0.1:11434' }),
      list: vi.fn().mockResolvedValue({ ok: true, value: { models: [] } }),
      ps: vi.fn().mockResolvedValue({ ok: true, value: { models: [] } }),
      show,
      pull,
      pullCancel: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      unload: vi.fn(),
      onPullProgress: vi.fn(() => () => {}),
      settings: { get: vi.fn(), set: vi.fn() },
      search,
      cloudList: vi.fn(),
      signInStatus: vi.fn(),
    } as unknown as MidniteStudioBridge['ollama'],
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = bridge;
  return { show, pull, search };
}

function renderField() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PullModelField />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  useModelsPullQueueStore.setState({ pulls: {} });
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('PullModelField', () => {
  it('lists parameter variants while typing and verifies before pull', async () => {
    const { show, pull, search } = installBridge();
    renderField();

    fireEvent.change(screen.getByRole('combobox', { name: 'Pull a model' }), {
      target: { value: 'llama' },
    });

    await waitFor(() => expect(screen.getByText('llama3.1:8b')).toBeTruthy(), { timeout: 2000 });
    expect(search).toHaveBeenCalledWith({ query: 'llama', scope: 'local' });
    expect(screen.getByText('llama3.1:70b')).toBeTruthy();

    fireEvent.click(screen.getByText('llama3.1:8b'));

    await waitFor(() => expect(show).toHaveBeenCalledWith({ model: 'llama3.1:8b' }));
    await waitFor(() => expect(pull).toHaveBeenCalledWith({ model: 'llama3.1:8b' }));
  });

  it('does not pull arbitrary typed text that is not a suggestion', async () => {
    const search = vi.fn().mockResolvedValue({
      ok: true,
      value: { items: [], stale: false, updatedAt: 'now' },
    });
    const pull = vi.fn();
    installBridge();
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio!.ollama!.search =
      search;
    (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio!.ollama!.pull =
      pull as MidniteStudioBridge['ollama']['pull'];
    renderField();

    fireEvent.change(screen.getByRole('combobox', { name: 'Pull a model' }), {
      target: { value: 'totally-unknown-model:99b' },
    });

    await waitFor(() => expect(screen.getByText(/no matching models/i)).toBeTruthy(), { timeout: 2000 });

    const pullBtn = screen.getByRole('button', { name: /^pull$/i });
    expect((pullBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pullBtn);
    expect(pull).not.toHaveBeenCalled();
  });

  it('surfaces verify failures without starting a download', async () => {
    const { show, pull } = installBridge({ showOk: false, showMessage: 'model not found' });
    renderField();

    fireEvent.change(screen.getByRole('combobox', { name: 'Pull a model' }), {
      target: { value: 'llama' },
    });
    await waitFor(() => expect(screen.getByText('llama3.1:8b')).toBeTruthy(), { timeout: 2000 });

    fireEvent.click(screen.getByText('llama3.1:8b'));

    await waitFor(() => expect(show).toHaveBeenCalledWith({ model: 'llama3.1:8b' }));
    expect((await screen.findByRole('alert')).textContent).toContain('model not found');
    expect(pull).not.toHaveBeenCalled();
  });
});
