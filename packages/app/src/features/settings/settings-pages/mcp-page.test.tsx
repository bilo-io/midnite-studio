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

  it('registers the server as `midnite` and explains how to re-register an old midnite-studio entry', async () => {
    installBridge({ get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js' }) });
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    expect(await screen.findByText('claude mcp add midnite -- node /app/mcp-shim.js')).toBeTruthy();
    const note = screen.getByTestId('mcp-rename-note');
    expect(note.textContent).toContain('claude mcp remove midnite-studio && claude mcp add midnite');
    expect(note.textContent).toContain('mcp__midnite__*');
  });

  it('toggling the switch calls mcp.set with the new value', async () => {
    const { set } = installBridge();
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    const checkbox = await screen.findByLabelText('Enable MCP server');
    fireEvent.click(checkbox);

    await waitFor(() => expect(set).toHaveBeenCalledWith({ enabled: true }));
  });

  it('renders the gate-decide switch disabled with the server off', async () => {
    installBridge();
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    // Its own accordion starts collapsed (only "MCP Server" is `defaultOpen`)
    // — open it first, same as a user would. `getByTestId`, not
    // `findByLabelText`: the Accordion region itself also carries an
    // `aria-label` matching its own title, which is the identical string.
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents decide workflow gates' }));
    const checkbox = await screen.findByTestId('mcp-allow-gate-decide');
    expect((checkbox as HTMLInputElement).disabled).toBe(true);
  });

  it('toggling the gate-decide switch calls mcp.set with the new value', async () => {
    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowGateDecide: false }),
    });
    render(<McpSettingsPage />, { wrapper: createWrapper() });

    fireEvent.click(await screen.findByRole('button', { name: 'Let agents decide workflow gates' }));
    const checkbox = await screen.findByTestId('mcp-allow-gate-decide');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);

    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowGateDecide: true }));
  });

  it('toggling the model-editing switch calls mcp.set with allowModels, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit 3D models' }));
    expect(((await screen.findByTestId('mcp-allow-models')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowGateDecide: false, allowModels: false }),
    });
    render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit 3D models' }));
    const checkbox = await screen.findByTestId('mcp-allow-models');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    // The page tells a user how to point their own Claude session at it.
    expect(screen.getByText(/Use your own Claude Code session/)).toBeTruthy();
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowModels: true }));
  });

  it('toggling the games switch calls mcp.set with allowGames, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents run and edit games' }));
    expect(((await screen.findByTestId('mcp-allow-games')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowGames: false }),
    });
    render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents run and edit games' }));
    const checkbox = await screen.findByTestId('mcp-allow-games');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowGames: true }));
  });

  it('toggling the terrains switch calls mcp.set with allowTerrains, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit terrains' }));
    expect(((await screen.findByTestId('mcp-allow-terrains')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowTerrains: false }),
    });
    render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit terrains' }));
    const checkbox = await screen.findByTestId('mcp-allow-terrains');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowTerrains: true }));
  });

  it('toggling the sprites switch calls mcp.set with allowSprites, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit sprites and maps' }));
    expect(((await screen.findByTestId('mcp-allow-sprites')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowSprites: false }),
    });
    render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit sprites and maps' }));
    const checkbox = await screen.findByTestId('mcp-allow-sprites');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowSprites: true }));
  });

  it('lists the model tools among the registered tools', async () => {
    installBridge();
    render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Tools' }));
    for (const id of ['model_set_spec', 'model_patch_parts', 'model_render_preview']) {
      expect(await screen.findByText(id)).toBeTruthy();
    }
  });

  it('lists the game tools among the registered tools', async () => {
    installBridge();
    render(<McpSettingsPage />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Tools' }));
    for (const id of ['game_list', 'game_create', 'game_screenshot', 'game_state', 'game_input']) {
      expect(await screen.findByText(id)).toBeTruthy();
    }
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
