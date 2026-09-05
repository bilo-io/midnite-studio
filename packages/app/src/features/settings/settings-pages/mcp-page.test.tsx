import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { McpSettingsPage } from './mcp-page';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function installBridge(overrides: Partial<MidniteStudioBridge['mcp']> = {}) {
  const get = vi.fn().mockResolvedValue({ enabled: false, running: false, socketPath: null, shimPath: null });
  const set = vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js' });
  const calls = vi.fn().mockResolvedValue({ calls: [] });
  const mcp = { get, set, calls, ...overrides } as MidniteStudioBridge['mcp'];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    mcp,
  } as Partial<MidniteStudioBridge>;
  return { get, set, calls };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('McpSettingsPage', () => {
  it('renders one row per MCP_TOOLS entry', async () => {
    installBridge();
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    // The eight Phase 57 read-only tools, straight from MCP_TOOLS — a
    // handful spot-checked rather than every id, since the point is "the
    // page renders from the registry", not re-listing it here.
    expect(await screen.findByText('repo.list')).toBeTruthy();
    expect(screen.getByText('status.get')).toBeTruthy();
    expect(screen.getByText('forge.checks')).toBeTruthy();
  });

  it('reflects a mocked mcp.get response in the switch', async () => {
    installBridge({ get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js' }) });
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    const checkbox = await screen.findByLabelText('Enable MCP server');
    await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(true));
    expect(screen.getByText('Listening')).toBeTruthy();
    expect(screen.getByText('/tmp/x.sock')).toBeTruthy();
  });

  it('toggling the switch calls mcp.set with the new value', async () => {
    const { set } = installBridge();
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    const checkbox = await screen.findByLabelText('Enable MCP server');
    fireEvent.click(checkbox);

    await waitFor(() => expect(set).toHaveBeenCalledWith({ enabled: true }));
  });

  it('renders an empty state with no calls', async () => {
    installBridge();
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    expect(await screen.findByText('No tool calls yet.')).toBeTruthy();
  });

  it('renders recorded calls when present', async () => {
    installBridge({
      calls: vi.fn().mockResolvedValue({ calls: [{ at: 1, tool: 'status.get', repoPath: '/x', ok: true, ms: 12 }] }),
    });
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    expect(await screen.findByText('status.get', { selector: 'span.font-mono' })).toBeTruthy();
  });
});
