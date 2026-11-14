// @vitest-environment node
import Module from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { inprocCreatePty } from './inproc-pty';

// pty-env re-exports the terminal feature's built entry; the env under test does not depend on it.
vi.mock('./pty-env', () => ({ agentFingerprintEnv: () => ({}), agentKeyEnv: () => ({}) }));

describe('inprocCreatePty env', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('drops a host agent session from the pty env but keeps TERM/COLORTERM and user config', () => {
    vi.stubEnv('NO_COLOR', '1');
    vi.stubEnv('CLAUDECODE', '1');
    vi.stubEnv('CLAUDE_CODE_MESSAGING_TOKEN', 'secret');
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/Users/x/.claude-alt');
    const spawn = vi.fn(() => ({ onData: vi.fn(), onExit: vi.fn(), pid: 1, kill: vi.fn() }));
    const realRequire = Module.prototype.require;
    vi.spyOn(Module.prototype, 'require').mockImplementation(function (this: NodeModule, id: string) {
      return id === 'node-pty' ? { spawn } : realRequire.call(this, id);
    } as typeof Module.prototype.require);

    inprocCreatePty({ sessionId: 's1', cwd: '/tmp', cols: 80, rows: 24 }, vi.fn(), vi.fn());

    expect(spawn).toHaveBeenCalledTimes(1);
    const calls = spawn.mock.calls as unknown as Array<[string, string[], { name: string; env: Record<string, string> }]>;
    const opts = calls[0]![2];
    expect(opts.name).toBe('xterm-256color');
    expect(opts.env).toMatchObject({ COLORTERM: 'truecolor', TERM_PROGRAM: 'midnite-studio', CLAUDE_CONFIG_DIR: '/Users/x/.claude-alt' });
    expect(opts.env).not.toHaveProperty('NO_COLOR');
    expect(opts.env).not.toHaveProperty('CLAUDECODE');
    expect(Object.keys(opts.env).filter((k) => k.startsWith('CLAUDE_CODE_'))).toEqual([]);
  });
});
