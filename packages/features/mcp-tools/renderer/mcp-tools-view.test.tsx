import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { McpToolsView } from './mcp-tools-view';

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

describe('McpToolsView', () => {
  it('renders one row per MCP_TOOLS entry', async () => {
    installBridge();
    render(<McpToolsView />, { wrapper: createWrapper() });

    // The eight Phase 57 read-only tools, straight from MCP_TOOLS — a
    // handful spot-checked rather than every id, since the point is "the
    // page renders from the registry", not re-listing it here.
    expect(await screen.findByText('repo.list')).toBeTruthy();
    expect(screen.getByText('status.get')).toBeTruthy();
    expect(screen.getByText('forge.checks')).toBeTruthy();
  });

  it('reflects a mocked mcp.get response in the switch', async () => {
    installBridge({ get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js' }) });
    render(<McpToolsView />, { wrapper: createWrapper() });

    const checkbox = await screen.findByLabelText('Enable MCP server');
    await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(true));
    expect(screen.getByText('Listening')).toBeTruthy();
    expect(screen.getByText('/tmp/x.sock')).toBeTruthy();
  });

  it('registers the server as `midnite` and explains how to re-register an old midnite-studio entry', async () => {
    installBridge({ get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js' }) });
    render(<McpToolsView />, { wrapper: createWrapper() });

    expect(await screen.findByText('claude mcp add midnite -- node /app/mcp-shim.js')).toBeTruthy();
    const note = screen.getByTestId('mcp-rename-note');
    expect(note.textContent).toContain('claude mcp remove midnite-studio && claude mcp add midnite');
    expect(note.textContent).toContain('mcp__midnite__*');
  });

  it('toggling the switch calls mcp.set with the new value', async () => {
    const { set } = installBridge();
    render(<McpToolsView />, { wrapper: createWrapper() });

    const checkbox = await screen.findByLabelText('Enable MCP server');
    fireEvent.click(checkbox);

    await waitFor(() => expect(set).toHaveBeenCalledWith({ enabled: true }));
  });

  it('renders the gate-decide switch disabled with the server off', async () => {
    installBridge();
    render(<McpToolsView />, { wrapper: createWrapper() });

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
    render(<McpToolsView />, { wrapper: createWrapper() });

    fireEvent.click(await screen.findByRole('button', { name: 'Let agents decide workflow gates' }));
    const checkbox = await screen.findByTestId('mcp-allow-gate-decide');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);

    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowGateDecide: true }));
  });

  it('toggling the model-editing switch calls mcp.set with allowModels, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit 3D models' }));
    expect(((await screen.findByTestId('mcp-allow-models')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowGateDecide: false, allowModels: false }),
    });
    render(<McpToolsView />, { wrapper: createWrapper() });
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
    const first = render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents run and edit games' }));
    expect(((await screen.findByTestId('mcp-allow-games')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowGames: false }),
    });
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents run and edit games' }));
    const checkbox = await screen.findByTestId('mcp-allow-games');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowGames: true }));
  });

  it('toggling the terrains switch calls mcp.set with allowTerrains, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit terrains' }));
    expect(((await screen.findByTestId('mcp-allow-terrains')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowTerrains: false }),
    });
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit terrains' }));
    const checkbox = await screen.findByTestId('mcp-allow-terrains');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowTerrains: true }));
  });

  it('toggling the sprites switch calls mcp.set with allowSprites, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit sprites and maps' }));
    expect(((await screen.findByTestId('mcp-allow-sprites')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowSprites: false }),
    });
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit sprites and maps' }));
    const checkbox = await screen.findByTestId('mcp-allow-sprites');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowSprites: true }));
  });

  it('toggling the maps switch calls mcp.set with allowMaps, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents capture maps' }));
    expect(((await screen.findByTestId('mcp-allow-maps')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowMaps: false }),
    });
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents capture maps' }));
    const checkbox = await screen.findByTestId('mcp-allow-maps');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowMaps: true }));
  });

  it('toggling the music switch calls mcp.set with allowMusic, and it is disabled with the server off', async () => {
    const off = installBridge();
    const first = render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit music' }));
    expect(((await screen.findByTestId('mcp-allow-music')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({ enabled: true, running: true, socketPath: '/tmp/x.sock', shimPath: '/app/mcp-shim.js', allowMusic: false }),
    });
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit music' }));
    const checkbox = await screen.findByTestId('mcp-allow-music');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowMusic: true }));
  });

  it('toggling the companion settings switch calls mcp.set with allowCompanionSettings, and it is disabled with the server off (Phase 109 Theme D)', async () => {
    const off = installBridge();
    const first = render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents change companion settings' }));
    expect(((await screen.findByTestId('mcp-allow-companion-settings')) as HTMLInputElement).disabled).toBe(true);
    expect(off.set).not.toHaveBeenCalled();
    first.unmount();

    const { set } = installBridge({
      get: vi.fn().mockResolvedValue({
        enabled: true,
        running: true,
        socketPath: '/tmp/x.sock',
        shimPath: '/app/mcp-shim.js',
        allowCompanionSettings: false,
      }),
    });
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents change companion settings' }));
    const checkbox = await screen.findByTestId('mcp-allow-companion-settings');
    await waitFor(() => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    await waitFor(() => expect(set).toHaveBeenCalledWith({ allowCompanionSettings: true }));
  });

  it('registers Midnite in Antigravity only after an explicit confirmation, and can unregister', async () => {
    const agyState = { registered: false };
    const agy = {
      status: vi.fn(async () => ({ ok: true as const, value: { registered: agyState.registered, configPath: '~/.gemini/antigravity/mcp_config.json' } })),
      register: vi.fn(async () => {
        agyState.registered = true;
        return { ok: true as const, value: { registered: true, configPath: '~/.gemini/antigravity/mcp_config.json' } };
      }),
      unregister: vi.fn(async () => {
        agyState.registered = false;
        return { ok: true as const, value: { registered: false, configPath: '~/.gemini/antigravity/mcp_config.json' } };
      }),
    };
    installBridge();
    (window as unknown as { midniteStudio: { media: unknown } }).midniteStudio.media = { music: { agy } };
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Let agents edit music' }));

    fireEvent.click(await screen.findByTestId('mcp-agy-register-button'));
    // Asking is not registering: nothing is written until the user confirms.
    expect(agy.register).not.toHaveBeenCalled();
    expect(await screen.findByTestId('mcp-agy-consent')).toBeTruthy();
    fireEvent.click(screen.getByTestId('mcp-agy-confirm'));
    await waitFor(() => expect(agy.register).toHaveBeenCalledWith({ consent: true }));

    fireEvent.click(await screen.findByTestId('mcp-agy-unregister'));
    await waitFor(() => expect(agy.unregister).toHaveBeenCalled());
  });

  it('lists the model tools among the registered tools', async () => {
    installBridge();
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Tools' }));
    for (const id of ['model_set_spec', 'model_patch_parts', 'model_render_preview']) {
      expect(await screen.findByText(id)).toBeTruthy();
    }
  });

  it('lists the game tools among the registered tools', async () => {
    installBridge();
    render(<McpToolsView />, { wrapper: createWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Tools' }));
    for (const id of ['game_list', 'game_create', 'game_screenshot', 'game_state', 'game_input']) {
      expect(await screen.findByText(id)).toBeTruthy();
    }
  });

  it('renders an empty state with no calls', async () => {
    installBridge();
    render(<McpToolsView />, { wrapper: createWrapper() });

    expect(await screen.findByText('No tool calls yet.')).toBeTruthy();
  });

  it('renders recorded calls when present', async () => {
    installBridge({
      calls: vi.fn().mockResolvedValue({ calls: [{ at: 1, tool: 'status.get', repoPath: '/x', ok: true, ms: 12 }] }),
    });
    render(<McpToolsView />, { wrapper: createWrapper() });

    expect(await screen.findByText('status.get', { selector: 'span.font-mono' })).toBeTruthy();
  });
});

describe('McpToolsView in an app with no server of its own', () => {
  // `agents` + the frame's tools only: `isAppInstalled` follows `shared/src/mcp-tool-owners.ts`.
  const onlyAgents = (app: string) => app === 'agents';

  it('lists the frame and Agents tools, and no Gamer or Creator tools', async () => {
    installBridge();
    // The app passes Audio's manifest, which is what makes `music_*` Creator's, and the Model feature's, which makes
    // `model_*` Gamer's (stubs: a feature cannot import another).
    const manifests = [
      { owner: 'creator', mcpTools: ['music_set_tempo'] },
      { owner: 'gamer', mcpTools: ['model_set_spec'] },
    ] as const;
    render(<McpToolsView isAppInstalled={onlyAgents} serverAvailable={false} manifests={manifests} />, { wrapper: createWrapper() });
    expect(await screen.findByText('repo.list')).toBeTruthy();
    expect(screen.getByText('workflow_gates_list')).toBeTruthy();
    expect(screen.queryByText('model_set_spec')).toBeNull();
    expect(screen.queryByText('music_set_tempo')).toBeNull();
  });

  it('says the server is Studio\'s and offers no switch, socket or connect command', async () => {
    installBridge();
    render(<McpToolsView isAppInstalled={onlyAgents} serverAvailable={false} />, { wrapper: createWrapper() });
    expect(await screen.findByTestId('mcp-no-server')).toBeTruthy();
    expect(screen.queryByLabelText('Enable MCP server')).toBeNull();
    expect(screen.queryByTestId('mcp-allow-ui')).toBeNull();
    expect(screen.queryByText('Socket path')).toBeNull();
  });
});
