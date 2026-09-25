import type { MidniteStudioBridge, OllamaModel, OllamaSearchResultItem } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function searchResult(over: Partial<OllamaSearchResultItem> = {}): OllamaSearchResultItem {
  return {
    name: 'llama3.1',
    description: 'Llama 3.1 from Meta.',
    capabilities: ['tools'],
    variants: ['8b', '70b'],
    pulls: '119.8M',
    updatedAt: '1 year ago',
    ...over,
  };
}

function installBridge(over: {
  reachable?: boolean;
  models?: OllamaModel[];
  searchItems?: OllamaSearchResultItem[];
  searchParseFailed?: boolean;
  cloudModels?: OllamaModel[];
  signedIn?: boolean;
  hasKey?: boolean;
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
  const pull = vi.fn().mockResolvedValue({ ok: true, value: { pullId: 'p1', model: 'llama3.1:8b' } });
  const search = vi.fn().mockResolvedValue(
    over.searchParseFailed
      ? { ok: false, kind: 'error', message: 'parse failed', code: 'parse' }
      : { ok: true, value: { items: over.searchItems ?? [], stale: false, updatedAt: 'now' } },
  );
  const cloudList = vi
    .fn()
    .mockResolvedValue({ ok: true, value: { models: over.cloudModels ?? [] } });
  const signInStatus = vi.fn().mockResolvedValue({ signedIn: over.signedIn ?? false });
  const secretsHas = vi.fn().mockResolvedValue({ hasKey: over.hasKey ?? false });
  const bridge: Partial<MidniteStudioBridge> = {
    ollama: {
      status,
      list,
      ps,
      show,
      pull,
      pullCancel: vi.fn(),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      create: vi.fn(),
      unload: vi.fn().mockResolvedValue({ ok: true }),
      onPullProgress: vi.fn(() => () => {}),
      settings: { get: vi.fn(), set: vi.fn() },
      search,
      cloudList,
      signInStatus,
    } as unknown as MidniteStudioBridge['ollama'],
    secrets: { get: vi.fn(), set: vi.fn(), has: secretsHas } as unknown as MidniteStudioBridge['secrets'],
    systemHealth: vi.fn().mockResolvedValue({}),
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = bridge;
  return { status, list, ps, show, pull, search, cloudList, signInStatus, secretsHas };
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

describe('ModelsView — Discover tab', () => {
  it('searches ollama.com on typing (debounced) and renders results', async () => {
    const { search } = installBridge({ reachable: true, searchItems: [searchResult()] });
    renderView();

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Discover' })).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    fireEvent.change(screen.getByPlaceholderText(/search ollama.com/i), {
      target: { value: 'llama' },
    });

    await waitFor(() => expect(screen.getByText('llama3.1')).toBeTruthy(), { timeout: 2000 });
    expect(search).toHaveBeenCalledWith({ query: 'llama', scope: 'local' });
    expect(screen.getByText('Llama 3.1 from Meta.')).toBeTruthy();
  });

  it('marks an already-installed result as Installed instead of offering Pull', async () => {
    installBridge({
      reachable: true,
      models: [model({ name: 'llama3.1:8b', model: 'llama3.1:8b' })],
      searchItems: [searchResult()],
    });
    renderView();

    fireEvent.click(await screen.findByRole('tab', { name: 'Discover' }));
    fireEvent.change(screen.getByPlaceholderText(/search ollama.com/i), {
      target: { value: 'llama' },
    });

    await waitFor(() => expect(screen.getByText('Installed')).toBeTruthy(), { timeout: 2000 });
    expect(screen.queryByRole('button', { name: /^pull$/i })).toBeNull();
  });

  it('falls back to a pull-by-name link when the scraper cannot parse the page', async () => {
    installBridge({ reachable: true, searchParseFailed: true });
    renderView();

    fireEvent.click(await screen.findByRole('tab', { name: 'Discover' }));
    fireEvent.change(screen.getByPlaceholderText(/search ollama.com/i), {
      target: { value: 'llama' },
    });

    await waitFor(() => expect(screen.getByText(/couldn't read ollama.com/i)).toBeTruthy(), {
      timeout: 2000,
    });
    expect(screen.getByRole('button', { name: /open ollama.com\/search/i })).toBeTruthy();
  });

  it('renders search result card with action button at top right, pulls in middle right, and updated date at bottom right', async () => {
    installBridge({
      reachable: true,
      searchItems: [
        searchResult({
          name: 'qwen2.5-coder',
          description: 'Code model from Alibaba Cloud.',
          capabilities: ['tools', 'thinking'],
          variants: ['7b', '14b', '32b'],
          pulls: '4.2M',
          updatedAt: '3 weeks ago',
        }),
      ],
    });
    renderView();

    fireEvent.click(await screen.findByRole('tab', { name: 'Discover' }));
    fireEvent.change(screen.getByPlaceholderText(/search ollama.com/i), {
      target: { value: 'qwen' },
    });

    await waitFor(() => expect(screen.getByText('qwen2.5-coder')).toBeTruthy(), { timeout: 2000 });

    // Left/middle content
    expect(screen.getByText('Code model from Alibaba Cloud.')).toBeTruthy();
    expect(screen.getAllByText('tools').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('thinking').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('7b')).toBeTruthy();
    expect(screen.getByText('14b')).toBeTruthy();
    expect(screen.getByText('32b')).toBeTruthy();

    // Right-side items
    const pullBtn = screen.getByRole('button', { name: /^pull$/i });
    const pullsCount = screen.getByText('4.2M pulls');
    const updatedAt = screen.getByText('updated 3 weeks ago');

    expect(pullBtn).toBeTruthy();
    expect(pullsCount).toBeTruthy();
    expect(updatedAt).toBeTruthy();

    // Verify right-side flex column structure and vertical ordering
    const rightCol = pullBtn.closest('.flex-col');
    expect(rightCol).toBeTruthy();
    const children = Array.from(rightCol?.children ?? []);
    expect(children.length).toBe(3);
    // Top right: action button
    expect(children[0]?.contains(pullBtn)).toBe(true);
    // Middle right: pulls count
    expect(children[1]?.contains(pullsCount)).toBe(true);
    // Bottom right: updated date
    expect(children[2]?.contains(updatedAt)).toBe(true);
  });

  it('renders Installed chip at top right when model is installed, alongside pulls and updated date', async () => {
    installBridge({
      reachable: true,
      models: [model({ name: 'llama3.1:8b', model: 'llama3.1:8b' })],
      searchItems: [
        searchResult({
          name: 'llama3.1',
          variants: ['8b', '70b'],
          pulls: '120M',
          updatedAt: '1 year ago',
        }),
      ],
    });
    renderView();

    fireEvent.click(await screen.findByRole('tab', { name: 'Discover' }));
    fireEvent.change(screen.getByPlaceholderText(/search ollama.com/i), {
      target: { value: 'llama' },
    });

    await waitFor(() => expect(screen.getByText('llama3.1')).toBeTruthy(), { timeout: 2000 });
    const pullsCount = screen.getByText('120M pulls');
    const updatedAt = screen.getByText('updated 1 year ago');

    const rightCol = pullsCount.closest('.flex-col');
    expect(rightCol).toBeTruthy();
    const children = Array.from(rightCol?.children ?? []);
    expect(children.length).toBe(3);
    expect(children[0]?.textContent).toBe('Installed');
    expect(children[1]?.contains(pullsCount)).toBe(true);
    expect(children[2]?.contains(updatedAt)).toBe(true);
  });
});

describe('ModelsView — Cloud tab', () => {
  it('shows a sign-in prompt when neither signed in nor an API key is set', async () => {
    installBridge({ reachable: true, signedIn: false, hasKey: false });
    renderView();

    fireEvent.click(await screen.findByRole('tab', { name: 'Cloud' }));

    await waitFor(() => expect(screen.getByText(/not signed in to ollama.com/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /run ollama signin/i })).toBeTruthy();
  });

  it('lists the cloud catalogue once signed in', async () => {
    const { cloudList } = installBridge({
      reachable: true,
      signedIn: true,
      cloudModels: [model({ name: 'qwen3.5', model: 'qwen3.5' })],
    });
    renderView();

    fireEvent.click(await screen.findByRole('tab', { name: 'Cloud' }));

    await waitFor(() => expect(screen.getByText('qwen3.5')).toBeTruthy());
    expect(cloudList).toHaveBeenCalled();
  });
});
