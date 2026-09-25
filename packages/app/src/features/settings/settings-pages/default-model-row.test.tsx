import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildDefaultModelOptions, DefaultModelRow } from './default-model-row';

const mocks = vi.hoisted(() => ({
  setActiveView: vi.fn(),
}));

vi.mock('../../../store/ui-store', () => ({
  useUiStore: {
    getState: () => ({ setActiveView: mocks.setActiveView }),
  },
}));

function installBridge(
  over: {
    reachable?: boolean;
    models?: { name: string; model: string }[];
    defaultModel?: string | null;
  } = {},
) {
  const settingsSet = vi.fn();
  const bridge: Partial<MidniteStudioBridge> = {
    ollama: {
      status: vi.fn().mockResolvedValue({
        reachable: over.reachable ?? true,
        version: '0.5.0',
        host: 'http://127.0.0.1:11434',
      }),
      list: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          models: (over.models ?? [{ name: 'qwen3.5:14b', model: 'qwen3.5:14b' }]).map((m) => ({
            ...m,
            modifiedAt: null,
            size: 1,
            digest: 'abc',
          })),
        },
      }),
      settings: {
        get: vi.fn().mockResolvedValue({
          host: null,
          defaultModel: over.defaultModel ?? null,
        }),
        set: settingsSet,
      },
    } as unknown as MidniteStudioBridge['ollama'],
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = bridge;
  return { settingsSet };
}

function renderRow() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DefaultModelRow />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('buildDefaultModelOptions', () => {
  it('adds a disabled row when the saved default is not installed', () => {
    const options = buildDefaultModelOptions(
      [{ name: 'llama3.2', model: 'llama3.2', modifiedAt: null, size: 1, digest: 'x' }],
      'missing:7b',
    );
    expect(options[0]).toMatchObject({ id: 'missing:7b', isDisabled: true });
    expect(options.some((o) => o.id === 'llama3.2')).toBe(true);
  });
});

describe('DefaultModelRow', () => {
  it('lists installed models in a searchable select and persists a pick', async () => {
    const { settingsSet } = installBridge({
      models: [
        { name: 'qwen3.5:14b', model: 'qwen3.5:14b' },
        { name: 'llama3.2', model: 'llama3.2' },
      ],
    });
    renderRow();

    const input = await screen.findByLabelText('Default Ollama model');
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: 'llama' } });
    fireEvent.click(await screen.findByText('llama3.2'));

    await waitFor(() =>
      expect(settingsSet).toHaveBeenCalledWith({ defaultModel: 'llama3.2' }),
    );
  });

  it('navigates to the Models view from Download local models', async () => {
    installBridge();
    renderRow();

    fireEvent.click(await screen.findByRole('button', { name: /download local models/i }));
    expect(mocks.setActiveView).toHaveBeenCalledWith('models');
  });

  it('disables the select when the daemon is unreachable', async () => {
    installBridge({ reachable: false });
    renderRow();

    expect(await screen.findByLabelText('Default Ollama model')).toHaveProperty('disabled', true);
  });
});
