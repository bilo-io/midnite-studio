import type { DemoApiStatus, MidniteStudioBridge, WorkflowNode } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DemoApiOfferBanner } from './demo-api-offer-banner';

function httpNode(id: string, url: string): WorkflowNode {
  return { id, kind: 'http', label: 'Call it', x: 0, y: 0, config: { url, method: 'GET', headers: {}, params: {}, queryShaped: false } };
}

function installBridge(status: DemoApiStatus, overrides: Partial<MidniteStudioBridge['demoApi']> = {}) {
  const start = vi.fn().mockResolvedValue({ ok: true, value: { running: true, port: 54321 } });
  const stop = vi.fn().mockResolvedValue({ ok: true });
  const statusFn = vi.fn().mockResolvedValue(status);
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    demoApi: { start, stop, status: statusFn, ...overrides } as unknown as MidniteStudioBridge['demoApi'],
  } as Partial<MidniteStudioBridge>;
  return { start, stop, status: statusFn };
}

function renderBanner(workflowId: string, nodes: WorkflowNode[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DemoApiOfferBanner workflowId={workflowId} nodes={nodes} />
    </QueryClientProvider>,
  );
}

describe('DemoApiOfferBanner (Phase 97 Theme M)', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders nothing when no node references {{demo.baseUrl}}', async () => {
    installBridge({ running: false });
    renderBanner('w1', [httpNode('a', 'https://example.com')]);
    // Give the status query a tick to settle either way — the banner still
    // must not appear, since nothing here references the demo root.
    await waitFor(() => expect(screen.queryByText(/uses the demo API/)).toBeNull());
  });

  it('renders nothing when the demo API is already running', async () => {
    installBridge({ running: true, port: 1 });
    renderBanner('w1', [httpNode('a', '{{demo.baseUrl}}/demo/echo')]);
    await waitFor(() => expect(screen.queryByText(/uses the demo API/)).toBeNull());
  });

  it('offers to start the demo API when a node references it and it is not running', async () => {
    installBridge({ running: false });
    renderBanner('w1', [httpNode('a', '{{demo.baseUrl}}/demo/echo')]);
    expect(await screen.findByText(/uses the demo API/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Start demo API' })).not.toBeNull();
  });

  it('starts the demo API when clicked', async () => {
    const { start } = installBridge({ running: false });
    renderBanner('w1', [httpNode('a', '{{demo.baseUrl}}/demo/echo')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Start demo API' }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it('dismisses per workflow id and stays hidden for that workflow', async () => {
    installBridge({ running: false });
    renderBanner('w1', [httpNode('a', '{{demo.baseUrl}}/demo/echo')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/uses the demo API/)).toBeNull();
  });
});
