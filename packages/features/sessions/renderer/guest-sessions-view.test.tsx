import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider, type GitMultiSelectProps, type GitTooltipProps } from '@midnite/studio-frame';
import type { TerminalSession } from '@midnite/studio-shared';

import { createGuestSessionsHost } from './guest-host';
import { SessionsHostProvider } from './host';
import { SessionsView } from './sessions-view';

/**
 * The Sessions view as a guest app composes it (Coder): the runtime host's sessions over the guest
 * channels, live rows only, and none of the controls that would start or end a session. jsdom — the
 * list, its rows and which controls exist are DOM facts; the xterm is a stand-in.
 */

const written: string[] = [];
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon() {}
    open() {}
    write(data: Uint8Array | string) {
      written.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
    }
    onData() {
      return { dispose() {} };
    }
    dispose() {}
  },
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const studio: TerminalSession = { id: 's1', kind: 'agent', agentId: 'claude', title: 'widgets', cwd: '/w', repoId: 'r1', createdAt: 1000 };
const agents: TerminalSession = { id: 'a1', kind: 'shell', title: 'flows', name: 'Started by Midnite Agents', cwd: '/f', repoId: '/f', createdAt: 2000 };
const row = (session: TerminalSession, ptyId: string) => ({ session, scrollback: new Uint8Array(0), live: { ptyId, pid: 7, cols: 80, rows: 24 } });

function installBridge() {
  const pty = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    snapshot: vi.fn(async () => ({ bytes: new TextEncoder().encode('$ make build\r\n') })),
    input: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(() => () => undefined),
    onExit: vi.fn(() => () => undefined),
  };
  const list = vi.fn(async () => ({ broker: { mode: 'broker' as const }, sessions: [row(studio, 'p-s1'), row(agents, 'p-a1')] }));
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { terminal: { list }, pty };
  return { pty, list };
}

const Tooltip = ({ children }: GitTooltipProps) => children;
const MultiSelectMenu = ({ label }: GitMultiSelectProps) => <button type="button">{label}</button>;

function renderGuest() {
  const kit = createFrameChrome();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = createGuestSessionsHost({ storageKey: 'test.sessions', Tooltip, MultiSelectMenu });
  return render(
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={kit.chrome}>
        <SessionsHostProvider host={host}>
          <SessionsView />
        </SessionsHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  written.length = 0;
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('Sessions, composed by a guest app', () => {
  it('lists the host’s sessions and another app’s, with no kill, resume, purge or history controls', async () => {
    installBridge();
    renderGuest();
    expect(await screen.findByText('Started by Midnite Agents', {}, { timeout: 5000 })).toBeTruthy();
    // Studio's own session, titled from its records: the agent's label from the roster.
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kill session' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Resume/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear history' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filter sessions by how they ended' })).toBeNull();
    // No graph in a guest app: an agent row carries no commit count rather than "0 commits".
    expect(screen.queryByTestId('session-commit-count')).toBeNull();
  });

  it('attaches a selected live session — subscribe, snapshot, then stream — and detaches on leaving it', async () => {
    const { pty } = installBridge();
    const view = renderGuest();
    fireEvent.click(await screen.findByText('Started by Midnite Agents', {}, { timeout: 5000 }));
    expect(await screen.findByTestId('guest-terminal', {}, { timeout: 5000 })).toBeTruthy();
    expect(pty.subscribe).toHaveBeenCalledWith({ ptyId: 'p-a1' });
    await vi.waitFor(() => expect(written.join('')).toContain('make build'));
    view.unmount();
    expect(pty.unsubscribe).toHaveBeenCalledWith({ ptyId: 'p-a1' });
  });
});
