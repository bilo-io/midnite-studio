import type { MidniteStudioBridge, OllamaModel, OllamaModelDetail } from '@midnite/studio-shared';
import { ThemeProvider } from '@bilo-io/ui/theme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { ModelDetailModal } from './model-detail';

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

function detail(over: Partial<OllamaModelDetail> = {}): OllamaModelDetail {
  return {
    modelfile: 'FROM qwen3.5:14b',
    parameters: '',
    template: '{{ .Prompt }}',
    license: 'Apache-2.0',
    capabilities: ['completion', 'tools'],
    contextLength: 131072,
    ...over,
  };
}

function installBridge(showResult: OllamaModelDetail) {
  const show = vi.fn().mockResolvedValue({ ok: true, value: showResult });
  const create = vi.fn().mockResolvedValue({ ok: true, value: { name: 'qwen3.5:14b-64k' } });
  const del = vi.fn().mockResolvedValue({ ok: true });
  const unload = vi.fn().mockResolvedValue({ ok: true });
  const bridge: Partial<MidniteStudioBridge> = {
    ollama: {
      status: vi.fn(),
      list: vi.fn().mockResolvedValue({ ok: true, value: { models: [] } }),
      ps: vi.fn().mockResolvedValue({ ok: true, value: { models: [] } }),
      show,
      pull: vi.fn(),
      pullCancel: vi.fn(),
      delete: del,
      create,
      unload,
      onPullProgress: vi.fn(() => () => {}),
      settings: { get: vi.fn(), set: vi.fn() },
    } as unknown as MidniteStudioBridge['ollama'],
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = bridge;
  return { show, create, del, unload };
}

function renderModal(props: { model: OllamaModel | null; onClose?: () => void }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <DialogHost>
          <ModelDetailModal open model={props.model} onClose={props.onClose ?? (() => {})} />
        </DialogHost>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  useUiStore.setState({ agentBackends: {} });
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('ModelDetailModal — header and stats', () => {
  it('renders nothing when no model is selected', () => {
    installBridge(detail());
    const { container } = renderModal({ model: null });
    expect(container.textContent).toBe('');
  });

  it('shows the model name, size and stat grid once details load', async () => {
    installBridge(detail());
    renderModal({ model: model() });

    await waitFor(() => expect(screen.getByText('14B')).toBeTruthy());
    expect(screen.getByText('Q4_K_M')).toBeTruthy();
    expect(screen.getByText('qwen3')).toBeTruthy();
    expect(screen.getByText('tools')).toBeTruthy();
  });
});

describe('ModelDetailModal — fit for agents verdict', () => {
  it('shows a fit verdict for tools + >= 64k effective context', async () => {
    installBridge(detail({ capabilities: ['completion', 'tools'], parameters: 'num_ctx 65536' }));
    renderModal({ model: model() });

    await waitFor(() => expect(screen.getByText('Fit for agents')).toBeTruthy());
    expect(screen.queryByText(/no tool calling/)).toBeNull();
  });

  it('flags a 4096-context model as not agent-ready, with a Make 64k action', async () => {
    installBridge(detail({ capabilities: ['completion', 'tools'], parameters: '' }));
    renderModal({ model: model() });

    await waitFor(() => expect(screen.getByText('Not agent-ready')).toBeTruthy());
    expect(screen.getByText('context 4096 — agents need 64k')).toBeTruthy();
    expect(screen.getByRole('button', { name: /make qwen3.5:14b-64k/i })).toBeTruthy();
  });

  it('flags missing tool calling', async () => {
    installBridge(detail({ capabilities: ['completion'], parameters: 'num_ctx 65536' }));
    renderModal({ model: model() });

    await waitFor(() => expect(screen.getByText('Not agent-ready')).toBeTruthy());
    expect(screen.getByText('no tool calling')).toBeTruthy();
  });
});

describe('ModelDetailModal — make 64k variant', () => {
  it('confirms before calling ollama.create with num_ctx 65536', async () => {
    const { create } = installBridge(detail({ capabilities: ['completion', 'tools'], parameters: '' }));
    renderModal({ model: model() });

    const makeButton = await screen.findByRole('button', { name: /make qwen3.5:14b-64k/i });
    fireEvent.click(makeButton);

    const confirmButton = await screen.findByRole('button', { name: 'Create variant' });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        from: 'qwen3.5:14b',
        name: 'qwen3.5:14b-64k',
        parameters: { num_ctx: 65536 },
      }),
    );
  });
});

describe('ModelDetailModal — delete', () => {
  it('confirms before calling ollama.delete, naming the size', async () => {
    const { del } = installBridge(detail());
    renderModal({ model: model() });

    const trigger = await screen.findByRole('button', { name: 'Delete qwen3.5:14b' });
    fireEvent.click(trigger);

    expect(await screen.findByText(/removes.*from disk/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith({ model: 'qwen3.5:14b' }));
  });
});

describe('ModelDetailModal — set as default for an agent', () => {
  it('writes the agentBackends binding on Set', async () => {
    installBridge(detail());
    renderModal({ model: model() });

    await waitFor(() => expect(screen.getByLabelText(/agent to set/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/agent to set/i), { target: { value: 'claude' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    expect(useUiStore.getState().agentBackends.claude).toEqual({ backend: 'ollama', model: 'qwen3.5:14b' });
  });
});

describe('ModelDetailModal — tabs', () => {
  it('switches between Modelfile/Template/Parameters/Licence content', async () => {
    installBridge(
      detail({
        modelfile: 'FROM qwen3.5:14b\nPARAMETER num_ctx 65536',
        template: '{{ .System }}{{ .Prompt }}',
        parameters: 'num_ctx 65536',
        license: 'Apache-2.0',
      }),
    );
    renderModal({ model: model() });

    await waitFor(() => expect(screen.getByText(/FROM qwen3.5:14b/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Template' }));
    await waitFor(() => expect(screen.getByText(/{{ \.System }}{{ \.Prompt }}/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Licence' }));
    await waitFor(() => expect(screen.getByText('Apache-2.0')).toBeTruthy());
  });
});
