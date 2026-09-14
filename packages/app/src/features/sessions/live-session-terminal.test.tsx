import type { TerminalSession } from '@midnite/studio-shared';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTerminalStore } from '../terminal/terminal-store';
import { LiveSessionTerminal } from './live-session-terminal';

/** jsdom has no `ResizeObserver` — a minimal stub, per `use-browser-bounds.test.tsx`. */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', StubResizeObserver);

/**
 * A fake `@xterm/xterm` `Terminal` — mirrors `transcript-view.test.tsx`'s own
 * fake, plus `onData` for the half that view never needed: this pane is
 * genuinely interactive.
 */
type KeyEvent = { type: string; key: string; metaKey?: boolean; ctrlKey?: boolean };

const { instances, FakeTerminal } = vi.hoisted(() => {
  class FakeTerminal {
    written: unknown[] = [];
    disposed = false;
    keyHandler: ((event: KeyEvent) => boolean) | null = null;
    dataHandler: ((data: string) => void) | null = null;
    cols = 80;
    rows = 24;
    constructor(public options: Record<string, unknown>) {
      instances.push(this);
    }
    open() {}
    loadAddon() {}
    write(data: unknown) {
      this.written.push(data);
    }
    attachCustomKeyEventHandler(handler: (event: KeyEvent) => boolean) {
      this.keyHandler = handler;
    }
    onData(handler: (data: string) => void) {
      this.dataHandler = handler;
      return { dispose: () => {} };
    }
    dispose() {
      this.disposed = true;
    }
  }
  const instances: InstanceType<typeof FakeTerminal>[] = [];
  return { instances, FakeTerminal };
});

vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock('../themes/resolve-palette', () => ({
  resolveTerminalPalette: () => ({ terminal: {} }),
}));

const { onDataHandlers, snapshot, subscribe, unsubscribe, input, resize } = vi.hoisted(() => ({
  onDataHandlers: [] as Array<(payload: { ptyId: string; data: Uint8Array }) => void>,
  snapshot: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  input: vi.fn(),
  resize: vi.fn(),
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    pty: {
      subscribe,
      unsubscribe,
      input,
      resize,
      snapshot,
      onData: (handler: (payload: { ptyId: string; data: Uint8Array }) => void) => {
        onDataHandlers.push(handler);
        return () => {
          const i = onDataHandlers.indexOf(handler);
          if (i >= 0) onDataHandlers.splice(i, 1);
        };
      },
      onExit: () => () => {},
      onAgentChanged: () => () => {},
      onCommandChanged: () => () => {},
    },
  }),
}));

function session(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'sess-1',
    kind: 'shell',
    cwd: '/repo',
    repoId: 'r1',
    title: 'repo-one',
    createdAt: 1000,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  instances.length = 0;
  onDataHandlers.length = 0;
  useTerminalStore.setState({ sessions: [], states: {}, ptyIds: {}, errors: {} });
});

describe('LiveSessionTerminal', () => {
  it('never calls pty.create — it only attaches to the pty already bound in terminal-store', async () => {
    useTerminalStore.setState({ ptyIds: { 'sess-1': 'pty-1' }, states: { 'sess-1': 'open' } });
    snapshot.mockResolvedValue({ bytes: new Uint8Array() });

    await act(async () => {
      render(<LiveSessionTerminal session={session()} />);
    });

    // `bridge()` here exposes no `create` at all — if the component ever
    // called it, this would throw rather than silently pass.
    expect(subscribe).toHaveBeenCalledWith({ ptyId: 'pty-1' });
    expect(snapshot).toHaveBeenCalledWith({ ptyId: 'pty-1' });
  });

  it('writes the current scrollback snapshot once the pty is open', async () => {
    useTerminalStore.setState({ ptyIds: { 'sess-1': 'pty-1' }, states: { 'sess-1': 'open' } });
    const payload = new Uint8Array(10).fill(65);
    snapshot.mockResolvedValue({ bytes: payload });

    await act(async () => {
      render(<LiveSessionTerminal session={session()} />);
    });

    expect(instances).toHaveLength(1);
    expect(instances[0]?.written[0]).toBe(payload);
  });

  it('sends a typed keystroke through terminal-store.sendInput, not a fresh IPC path of its own', async () => {
    useTerminalStore.setState({ ptyIds: { 'sess-1': 'pty-1' }, states: { 'sess-1': 'open' } });
    snapshot.mockResolvedValue({ bytes: new Uint8Array() });

    await act(async () => {
      render(<LiveSessionTerminal session={session()} />);
    });

    instances[0]?.dataHandler?.('y\r');

    expect(input).toHaveBeenCalledWith({ ptyId: 'pty-1', data: 'y\r' });
  });

  it('shows a starting placeholder rather than a blank pane while the pty is not yet open', () => {
    useTerminalStore.setState({ ptyIds: {}, states: { 'sess-1': 'starting' } });

    render(<LiveSessionTerminal session={session()} />);

    expect(screen.getByText('Starting…')).toBeTruthy();
    expect(instances).toHaveLength(0);
  });

  it('shows the error message for an unavailable session', () => {
    useTerminalStore.setState({
      ptyIds: {},
      states: { 'sess-1': 'unavailable' },
      errors: { 'sess-1': 'node-pty failed to load' },
    });

    render(<LiveSessionTerminal session={session()} />);

    expect(screen.getByText('node-pty failed to load')).toBeTruthy();
  });

  it('tears down cleanly on unmount — disposes the terminal and unsubscribes the pty', async () => {
    useTerminalStore.setState({ ptyIds: { 'sess-1': 'pty-1' }, states: { 'sess-1': 'open' } });
    snapshot.mockResolvedValue({ bytes: new Uint8Array() });

    const { unmount } = render(<LiveSessionTerminal session={session()} />);
    await act(async () => {});

    expect(instances[0]?.disposed).toBe(false);
    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();

    expect(instances[0]?.disposed).toBe(true);
    expect(unsubscribe).toHaveBeenCalledWith({ ptyId: 'pty-1' });
  });
});
