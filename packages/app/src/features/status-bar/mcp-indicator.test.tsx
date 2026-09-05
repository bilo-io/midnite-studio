import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { McpIndicator } from './mcp-indicator';

function installBridge(running: boolean) {
  const get = vi.fn().mockResolvedValue({ enabled: running, running, socketPath: running ? '/tmp/x.sock' : null, shimPath: null });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    mcp: { get } as unknown as MidniteStudioBridge['mcp'],
  } as Partial<MidniteStudioBridge>;
  return { get };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useUiStore.setState({ activeView: 'graph', settingsPage: 'appearance' });
});

describe('McpIndicator', () => {
  it('renders nothing while the server is not running', async () => {
    installBridge(false);
    render(<McpIndicator />);
    await act(async () => {});
    expect(screen.queryByText('MCP')).toBeNull();
  });

  it('renders while the server is running, and opens Settings on click', async () => {
    installBridge(true);
    render(<McpIndicator />);

    const button = await screen.findByText('MCP');
    fireEvent.click(button);

    expect(useUiStore.getState().activeView).toBe('settings');
    expect(useUiStore.getState().settingsPage).toBe('mcp');
  });

  it('does nothing (rather than throwing) with no bridge present', async () => {
    render(<McpIndicator />);
    await act(async () => {});
    expect(screen.queryByText('MCP')).toBeNull();
  });
});
