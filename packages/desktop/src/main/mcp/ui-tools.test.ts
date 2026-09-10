import { afterEach, describe, expect, it, vi } from 'vitest';

import * as uiBridge from '../companion/ui-bridge';
import { McpToolError } from './errors';
import { uiCommand, uiNavigate, uiState } from './tools';
import { resetMcpAllowUiStateForTests, setMcpAllowUiState } from './ui-gate';

/**
 * Unit coverage for the three `ui.*` tool handlers (Phase 81 Theme F),
 * isolated from the real Unix-socket server (`server.test.ts`) and from
 * `ui-bridge.ts`'s own round trip (`ui-bridge.test.ts`) — `requestUiAction`
 * is mocked here so each handler's own logic (the `allowUi` gate, and
 * mapping a renderer reply's `did` shape onto its own output) is what is
 * under test, not the transport underneath it.
 */
vi.mock('../companion/ui-bridge', () => ({ requestUiAction: vi.fn() }));

const requestUiAction = vi.mocked(uiBridge.requestUiAction);

afterEach(() => {
  resetMcpAllowUiStateForTests();
  requestUiAction.mockReset();
});

describe('uiState', () => {
  it('answers regardless of the allowUi switch', async () => {
    setMcpAllowUiState(false);
    requestUiAction.mockResolvedValue({
      ok: true,
      value: {
        did: 'state',
        activeView: 'graph',
        settingsPage: null,
        detached: [],
        repoPath: null,
        locked: false,
      },
    });

    const result = await uiState();
    expect(result).toEqual({
      activeView: 'graph',
      settingsPage: null,
      detached: [],
      repoPath: null,
      locked: false,
      uiToolsEnabled: false,
    });
  });

  it('reports uiToolsEnabled: true once the switch is on, in the same call shape', async () => {
    setMcpAllowUiState(true);
    requestUiAction.mockResolvedValue({
      ok: true,
      value: {
        did: 'state',
        activeView: 'settings',
        settingsPage: 'mcp',
        detached: ['graph'],
        repoPath: '/repo',
        locked: true,
      },
    });

    const result = await uiState();
    expect(result.uiToolsEnabled).toBe(true);
    expect(result.locked).toBe(true);
  });

  it('refuses when the renderer never answers (no window, or the 5s timeout)', async () => {
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'the window did not answer' });
    await expect(uiState()).rejects.toMatchObject({ kind: 'refused' });
  });
});

describe('uiNavigate', () => {
  it('refuses before any request is sent while allowUi is off', async () => {
    setMcpAllowUiState(false);
    await expect(uiNavigate({ view: 'graph' })).rejects.toMatchObject({
      kind: 'refused',
      message: 'UI tools are off — Settings ▸ MCP ▸ Let agents steer the UI',
    });
    expect(requestUiAction).not.toHaveBeenCalled();
  });

  it('sends a navigate action and returns the renderer’s did/view once allowUi is on', async () => {
    setMcpAllowUiState(true);
    requestUiAction.mockResolvedValue({ ok: true, value: { did: 'navigated', view: 'graph' } });

    const result = await uiNavigate({ view: 'graph' });
    expect(result).toEqual({ did: 'navigated', view: 'graph' });
    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'navigate', view: 'graph' });
  });

  it('passes page/issue through when present', async () => {
    setMcpAllowUiState(true);
    requestUiAction.mockResolvedValue({ ok: true, value: { did: 'navigated', view: 'settings' } });

    await uiNavigate({ view: 'settings', page: 'mcp' });
    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'navigate', view: 'settings', page: 'mcp' });
  });

  it('refuses when the renderer declines (confirm/never tier, or a locked screen)', async () => {
    setMcpAllowUiState(true);
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'The screen is locked.' });
    await expect(uiNavigate({ view: 'graph' })).rejects.toMatchObject({
      kind: 'refused',
      message: 'The screen is locked.',
    });
  });
});

describe('uiCommand', () => {
  it('refuses before any request is sent while allowUi is off', async () => {
    setMcpAllowUiState(false);
    await expect(uiCommand({ id: 'sync.fetch' })).rejects.toMatchObject({
      kind: 'refused',
      message: 'UI tools are off — Settings ▸ MCP ▸ Let agents steer the UI',
    });
    expect(requestUiAction).not.toHaveBeenCalled();
  });

  it('sends a command action and returns the renderer’s label once allowUi is on', async () => {
    setMcpAllowUiState(true);
    requestUiAction.mockResolvedValue({ ok: true, value: { did: 'ran', label: 'Fetch' } });

    const result = await uiCommand({ id: 'sync.fetch' });
    expect(result).toEqual({ did: 'ran', label: 'Fetch' });
    expect(requestUiAction).toHaveBeenCalledWith({ kind: 'command', id: 'sync.fetch' });
  });

  it('refuses a confirm-tier id the same way the renderer refuses it', async () => {
    setMcpAllowUiState(true);
    requestUiAction.mockResolvedValue({
      ok: false,
      kind: 'error',
      message: 'needs the user — ask them to run it from the palette',
    });
    await expect(uiCommand({ id: 'sync.push' })).rejects.toMatchObject({ kind: 'refused' });
  });

  it('propagates the McpToolError instance so dispatch.ts reads its own kind/message', async () => {
    setMcpAllowUiState(true);
    requestUiAction.mockResolvedValue({ ok: false, kind: 'error', message: 'boom' });
    try {
      await uiCommand({ id: 'sync.fetch' });
      throw new Error('expected uiCommand to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(McpToolError);
      expect((err as McpToolError).kind).toBe('refused');
      expect((err as McpToolError).message).toBe('boom');
    }
  });
});
