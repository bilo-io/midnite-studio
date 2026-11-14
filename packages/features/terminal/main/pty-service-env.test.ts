// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PtyPorts } from './pty-ports';
import { createPty, initPtyService, setPtyPorts } from './pty-service';

function makePorts(brokerCreate: (opts: { env?: Record<string, string> }) => Promise<unknown>): PtyPorts {
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
        listSessions: async () => [],
        createPty: brokerCreate,
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

describe('createPty env', () => {
  afterEach(() => {
    setPtyPorts(null);
    vi.unstubAllEnvs();
  });

  it('drops a host agent session from the env it hands the broker but keeps TERM/COLORTERM and user config', async () => {
    vi.stubEnv('NO_COLOR', '1');
    vi.stubEnv('CLAUDECODE', '1');
    vi.stubEnv('CLAUDE_CODE_MESSAGING_SOCKET', '/tmp/cc-socks/1.sock');
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'abc');
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/Users/x/.claude-alt');
    vi.stubEnv('TERM', 'xterm-256color');
    const create = vi.fn(async (_opts: { env?: Record<string, string> }) => ({ ok: false as const, message: 'stop' }));
    setPtyPorts(makePorts(create));
    await initPtyService({ userDataDir: '/tmp', appVersion: '0.0.1', isPackaged: false, getWindow: () => null, declaredAgentId: async () => null });

    await createPty({ sessionId: 's', cwd: '/tmp', cols: 80, rows: 24 });

    const env = create.mock.calls[0]![0].env!;
    expect(env).toMatchObject({ COLORTERM: 'truecolor', TERM: 'xterm-256color', CLAUDE_CONFIG_DIR: '/Users/x/.claude-alt' });
    expect(env).not.toHaveProperty('NO_COLOR');
    expect(env).not.toHaveProperty('CLAUDECODE');
    expect(Object.keys(env).filter((k) => k.startsWith('CLAUDE_CODE_'))).toEqual([]);
  });
});
