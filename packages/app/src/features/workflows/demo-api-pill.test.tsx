import type { DemoApiStatus, MidniteStudioBridge, WorkflowNode } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DemoApiPill } from './demo-api-pill';

const httpNode: WorkflowNode = {
  id: 'n1',
  kind: 'http',
  label: 'Call it',
  x: 0,
  y: 0,
  config: { url: '', method: 'GET', headers: {}, params: {}, queryShaped: false },
};

const noteNode: WorkflowNode = {
  id: 'n2',
  kind: 'note',
  label: 'A note',
  x: 0,
  y: 0,
  config: { text: '' },
};

function installBridge(status: DemoApiStatus, overrides: Partial<MidniteStudioBridge['demoApi']> = {}) {
  const start = vi.fn().mockResolvedValue({ ok: true, value: { running: true, port: 54321 } });
  const stop = vi.fn().mockResolvedValue({ ok: true });
  const statusFn = vi.fn().mockResolvedValue(status);
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    demoApi: { start, stop, status: statusFn, ...overrides } as unknown as MidniteStudioBridge['demoApi'],
  } as Partial<MidniteStudioBridge>;
  return { start, stop, status: statusFn };
}

function renderPill(node: WorkflowNode | null, onInsertUrl = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DemoApiPill selectedNode={node} onInsertUrl={onInsertUrl} />
    </QueryClientProvider>,
  );
  return { onInsertUrl };
}

describe('DemoApiPill', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('shows stopped with a start button, no insert action, when not running', async () => {
    installBridge({ running: false });
    renderPill(httpNode);

    expect(await screen.findByText(/Demo API · stopped/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'start' })).not.toBeNull();
    expect(screen.queryByTitle('Insert base URL into the selected node')).toBeNull();
  });

  it('shows the port and a stop button when running', async () => {
    installBridge({ running: true, port: 54321 });
    renderPill(null);

    expect(await screen.findByText(/Demo API · running on :54321/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'stop' })).not.toBeNull();
  });

  it('only offers to insert the URL when running AND an http node is selected', async () => {
    installBridge({ running: true, port: 54321 });
    renderPill(noteNode);
    await screen.findByText(/Demo API · running on :54321/);
    expect(screen.queryByTitle('Insert base URL into the selected node')).toBeNull();

    cleanup();
    installBridge({ running: true, port: 54321 });
    const { onInsertUrl } = renderPill(httpNode);
    await screen.findByText(/Demo API · running on :54321/);
    const insert = screen.getByTitle('Insert base URL into the selected node');
    fireEvent.click(insert);
    expect(onInsertUrl).toHaveBeenCalledWith('http://127.0.0.1:54321');
  });

  it('starts the server when stopped and clicked', async () => {
    const { start } = installBridge({ running: false });
    renderPill(null);
    await screen.findByText(/stopped/);

    fireEvent.click(screen.getByRole('button', { name: 'start' }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it('stops the server when running and clicked', async () => {
    const { stop } = installBridge({ running: true, port: 54321 });
    renderPill(null);
    await screen.findByText(/running on :54321/);

    fireEvent.click(screen.getByRole('button', { name: 'stop' }));
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
  });
});
