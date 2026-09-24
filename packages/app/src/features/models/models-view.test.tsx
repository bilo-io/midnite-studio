import type { MidniteStudioBridge, OllamaModel } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { ModelsView } from './models-view';
import { useModelsPullQueueStore } from './models-pull-queue-store';

function model(over: Partial<OllamaModel> = {}): OllamaModel {
  return {
    name: 'qwen3.5:14b',
    model: 'qwen3.5:14b',
    modifiedAt: '2026-09-01T00:00:00Z',
    size: 8_500_000_000,
    digest: 'sha256:abc',
    details: { family: 'qwen3', parameterSize: '14B', quantizationLevel: 'Q4_K_M' },
    ...over,
  };
}

function installBridge(over: {
  reachable?: boolean;
  models?: OllamaModel[];
} = {}) {
  const reachable = over.reachable ?? true;
  const status = vi.fn().mockResolvedValue({
    reachable,
    version: reachable ? '0.5.0' : null,
    host: 'http://127.0.0.1:11434',
  });
  const list = vi.fn().mockResolvedValue({ ok: true, value: { models: over.models ?? [] } });
  const ps = vi.fn().mockResolvedValue({ ok: true, value: { models: [] } });
  const show = vi.fn().mockResolvedValue({ ok: true, value: { capabilities: [] } });
  const bridge: Partial<MidniteStudioBridge> = {
    ollama: {
      status,
      list,
      ps,
      show,
      pull: vi.fn(),
      pullCancel: vi.fn(),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      create: vi.fn(),
      unload: vi.fn().mockResolvedValue({ ok: true }),
      onPullProgress: vi.fn(() => () => {}),
      settings: { get: vi.fn(), set: vi.fn() },
    } as unknown as MidniteStudioBridge['ollama'],
    systemHealth: vi.fn().mockResolvedValue({}),
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = bridge;
  return { status, list, ps, show };
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <ModelsView />
      </DialogHost>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  useModelsPullQueueStore.setState({ pulls: {} });
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('ModelsView — daemon-down empty state', () => {
  it('shows Start Ollama instead of the model list when the daemon is unreachable', async () => {
    installBridge({ reachable: false });
    renderView();

    await waitFor(() => expect(screen.getByText(/isn't running/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /start ollama/i })).toBeTruthy();
    expect(screen.queryByText('qwen3.5:14b')).toBeNull();
  });
});

describe('ModelsView — installed empty state', () => {
  it('shows "no models installed" when the daemon has nothing pulled', async () => {
    installBridge({ reachable: true, models: [] });
    renderView();

    await waitFor(() => expect(screen.getByText(/no models installed yet/i)).toBeTruthy());
  });
});

describe('ModelsView — installed list', () => {
  it('renders a pulled model with its family/param/quant chips', async () => {
    installBridge({ reachable: true, models: [model()] });
    renderView();

    await waitFor(() => expect(screen.getByText('qwen3.5:14b')).toBeTruthy());
    expect(screen.getByText('qwen3')).toBeTruthy();
    expect(screen.getByText('14B')).toBeTruthy();
    expect(screen.getByText('Q4_K_M')).toBeTruthy();
  });
});
