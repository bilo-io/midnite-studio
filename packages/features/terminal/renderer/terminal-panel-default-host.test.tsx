// vitest/jsdom: the panel as a non-Studio app composes it — the default host, the frame's plain chrome, a mock bridge.
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultTerminalHost } from './default-host';
import { TerminalHostProvider } from './host';
import { TerminalPanel } from './terminal-panel';
import { useTerminalStore } from './terminal-store';

function Shell({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <TerminalHostProvider host={createDefaultTerminalHost('browser')}>{children}</TerminalHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}

const setBridge = (list: () => Promise<unknown>) => {
  (window as unknown as { midniteStudio: unknown }).midniteStudio = {
    terminal: { list },
    agent: { list: () => Promise.resolve({ agents: [] }) },
  };
};

beforeEach(() => {
  useTerminalStore.setState({ sessions: [], activeId: null, hydrated: false, broker: { mode: 'broker' } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('TerminalPanel under the default host', () => {
  it('renders with no Studio store behind it', async () => {
    setBridge(() => Promise.resolve({ sessions: [] }));
    render(
      <Shell>
        <TerminalPanel cwd={null} repoId={null} repoName="" fitSignal={0} />
      </Shell>,
    );
    await waitFor(() => expect(useTerminalStore.getState().hydrated).toBe(true));
    expect(screen.getByText('No worktree selected.')).toBeTruthy();
    expect(screen.queryByTestId('terminal-broker-status')).toBeNull();
  });

  it('says why the dock is empty when the broker cannot be reached', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setBridge(() => Promise.reject(new Error('connect ENOENT broker.sock')));
    render(
      <Shell>
        <TerminalPanel cwd={null} repoId={null} repoName="" fitSignal={0} />
      </Shell>,
    );
    const status = await screen.findByTestId('terminal-broker-status');
    expect(status.textContent).toBe('Sessions will not survive quit — connect ENOENT broker.sock');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(useTerminalStore.getState().broker).toEqual({ mode: 'inproc', reason: 'connect ENOENT broker.sock' });
  });
});
