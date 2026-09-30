import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useModelsPullQueueStore } from '../../models/models-pull-queue-store';
import { OllamaPage } from './ollama-page';

/** Phase 98 Theme I — RAM badges and pull starts on the Ollama page. */
const GIB = 2 ** 30;

function install({ ram = 16 * GIB, reachable = true, ollamaInstalled = true } = {}) {
  const ollama = {
    status: vi.fn().mockResolvedValue({ reachable, version: reachable ? '0.5.0' : null, host: 'http://127.0.0.1:11434' }),
    list: vi.fn().mockResolvedValue({ ok: true, value: { models: [] } }),
    pull: vi.fn().mockImplementation(async ({ model }: { model: string }) => ({ ok: true, value: { pullId: `p-${model}`, model } })),
    onPullProgress: vi.fn(() => () => undefined),
  };
  const probe = vi.fn().mockResolvedValue({
    results: [
      { id: 'homebrew', installed: true, version: 'Homebrew 4', path: '/opt/homebrew/bin/brew' },
      { id: 'ollama', installed: ollamaInstalled, version: null, path: null },
    ],
  });
  (window as unknown as { midniteStudio: unknown }).midniteStudio = {
    ollama,
    setup: { probe },
    systemMemory: vi.fn().mockResolvedValue({ totalBytes: ram }),
  } as unknown as Partial<MidniteStudioBridge>;
  return ollama;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OllamaPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => useModelsPullQueueStore.setState({ pulls: {} }));
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('OllamaPage', () => {
  it('badges each model against this Mac RAM', async () => {
    install({ ram: 16 * GIB });
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('ram-badge').length).toBeGreaterThan(0));
    const badges = screen.getAllByTestId('ram-badge').map((el) => el.textContent);
    expect(badges).toContain('Fits');
    expect(badges).toContain('Too big');
  });

  it('pulls every ticked model and feeds the shared queue store', async () => {
    const ollama = install();
    renderPage();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Llama 3.2 3B' }));
    const button = await screen.findByRole('button', { name: 'Download 1 model' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(ollama.pull).toHaveBeenCalledWith({ model: 'llama3.2:3b' }));
    await waitFor(() => expect(Object.values(useModelsPullQueueStore.getState().pulls).map((p) => p.model)).toEqual(['llama3.2:3b']));
  });

  it('warns when a too-big model is ticked but still allows it', async () => {
    install({ ram: 8 * GIB });
    renderPage();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Qwen3 14B' }));
    expect(await screen.findByRole('note')).toBeTruthy();
  });

  it('offers Start Ollama when installed but not running, and blocks downloads', async () => {
    install({ reachable: false });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Start Ollama' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Llama 3.2 3B' }));
    expect((screen.getByRole('button', { name: 'Download 1 model' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers the brew install when Ollama is missing', async () => {
    install({ reachable: false, ollamaInstalled: false });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Install with Homebrew' })).toBeTruthy();
  });
});
