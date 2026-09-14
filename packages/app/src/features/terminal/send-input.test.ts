import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTerminalStore } from './terminal-store';

/**
 * `terminal-store.sendInput` (Phase 86 Theme D) — its own file, not
 * `terminal-store.test.ts`, because that file deliberately runs with no
 * `bridge()` mock (its own header comment: "`bridge()` returns undefined
 * under jsdom"). This is the one store action that is pure pass-through to
 * the bridge and has nothing to assert without mocking it.
 */
const input = vi.fn();
vi.mock('../../services/bridge', () => ({
  bridge: () => ({ pty: { input } }),
}));

afterEach(() => {
  vi.clearAllMocks();
  useTerminalStore.setState({ ptyIds: {} });
});

describe('useTerminalStore.sendInput', () => {
  it('sends bytes to the pty bound to the given session', () => {
    useTerminalStore.setState({ ptyIds: { s1: 'pty-1' } });

    useTerminalStore.getState().sendInput('s1', 'ls\r');

    expect(input).toHaveBeenCalledWith({ ptyId: 'pty-1', data: 'ls\r' });
  });

  it('is a silent no-op for a session with no bound pty', () => {
    useTerminalStore.setState({ ptyIds: {} });

    expect(() => useTerminalStore.getState().sendInput('unbound', 'x')).not.toThrow();
    expect(input).not.toHaveBeenCalled();
  });
});
