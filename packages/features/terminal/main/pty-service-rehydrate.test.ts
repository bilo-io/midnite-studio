// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PtyAgentWatcher, PtyPorts } from './pty-ports';
import { agentIdFor, initPtyService, setAgentWatcher, setPtyPorts } from './pty-service';

function makePorts(running: { ptyId: string; sessionId: string; pid: number; cols: number; rows: number; legacy: boolean }[]): PtyPorts {
  return {
    windows: { main: () => null, fromId: () => null },
    confinement: () => null,
    readAgentApiKey: async () => null,
    readOllamaApiKey: async () => null,
    inproc: {
      isPidAlive: () => false,
      setAgentWatcher: () => {},
      readScrollback: () => new Uint8Array(0),
      seedScrollback: () => {},
      scrollbackSessionIds: () => [],
      dropScrollback: () => {},
      createPty: () => ({ ok: false, message: 'unused' }),
      writePty: () => {},
      resizePty: () => {},
      sessionIdFor: () => undefined,
      livePtyFor: () => null,
      killPty: () => {},
      killAllPtys: () => {},
      activePtyPids: () => [],
      ptySessionOwners: () => new Map(),
      ptySessionCount: () => 0,
    },
    broker: {
      create: () => ({
        init: async () => {},
        getStatus: () => ({ mode: 'broker' as const }),
        isAlive: () => true,
        onData: () => {},
        onExit: () => {},
        listSessions: async () => running,
        createPty: async () => ({ ok: false as const, message: 'unused' }),
        writePty: () => {},
        resizePty: async () => {},
        killPty: async () => {},
        disconnect: async () => {},
        forgetScrollback: () => {},
        snapshotScrollback: async () => new Uint8Array(0),
      }) as unknown as ReturnType<PtyPorts['broker']['create']>,
      location: () => ({ socketPath: '/tmp/test.sock', directory: '/tmp' }),
    },
  };
}

function makeWatcher(): PtyAgentWatcher & {
  track: ReturnType<typeof vi.fn<(ptyId: string, pid: number, declared: string | null) => void>>;
  noteOutput: ReturnType<typeof vi.fn<(ptyId: string) => void>>;
} {
  const known = new Map<string, string | null>();
  return {
    track: vi.fn<(ptyId: string, pid: number, declared: string | null) => void>((ptyId, _pid, declared) => {
      known.set(ptyId, declared);
    }),
    noteOutput: vi.fn<(ptyId: string) => void>(),
    untrack: vi.fn<(ptyId: string) => void>((ptyId) => {
      known.delete(ptyId);
    }),
    currentAgentId: (ptyId: string) => known.get(ptyId) ?? null,
  };
}

describe('pty-service broker rehydration', () => {
  afterEach(() => {
    setAgentWatcher(null);
    setPtyPorts(null);
  });

  it('tracks re-hydrated broker sessions when setAgentWatcher runs before initPtyService', async () => {
    setPtyPorts(
      makePorts([
        { ptyId: 'pty-1', sessionId: 's-1', pid: 1001, cols: 80, rows: 24, legacy: false },
        { ptyId: 'pty-2', sessionId: 's-2', pid: 1002, cols: 80, rows: 24, legacy: false },
      ]),
    );
    const watcher = makeWatcher();
    setAgentWatcher(watcher);

    await initPtyService({
      userDataDir: '/tmp',
      appVersion: '0.0.1',
      isPackaged: false,
      getWindow: () => null,
      declaredAgentId: async (sessionId) => (sessionId === 's-1' ? 'claude' : null),
    });

    expect(watcher.track).toHaveBeenCalledWith('pty-1', 1001, 'claude');
    expect(watcher.track).toHaveBeenCalledWith('pty-2', 1002, null);
    expect(watcher.noteOutput).toHaveBeenCalledWith('pty-1');
    expect(watcher.noteOutput).toHaveBeenCalledWith('pty-2');
    expect(agentIdFor('pty-1')).toBe('claude');
    expect(agentIdFor('pty-2')).toBeNull();
  });

  it('tracks already-hydrated broker sessions when setAgentWatcher runs after initPtyService', async () => {
    setPtyPorts(
      makePorts([
        { ptyId: 'pty-3', sessionId: 's-3', pid: 1003, cols: 80, rows: 24, legacy: false },
      ]),
    );

    await initPtyService({
      userDataDir: '/tmp',
      appVersion: '0.0.1',
      isPackaged: false,
      getWindow: () => null,
      declaredAgentId: async () => 'codex',
    });

    const watcher = makeWatcher();
    setAgentWatcher(watcher);
    await vi.waitFor(() => {
      expect(watcher.track).toHaveBeenCalledWith('pty-3', 1003, 'codex');
    });
    expect(watcher.noteOutput).toHaveBeenCalledWith('pty-3');
    expect(agentIdFor('pty-3')).toBe('codex');
  });
});
