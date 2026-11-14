import { describe, expect, it } from 'vitest';

import { scrubHostAgentEnv, scrubHostAgentProcessEnv } from './agent-env';

const LEAKED = {
  NO_COLOR: '1',
  CLAUDECODE: '1',
  CLAUDE_CODE_CHILD_SESSION: '1',
  CLAUDE_CODE_SESSION_ID: '6d61e33c',
  CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/cc-socks/36920.sock',
  CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
  CLAUDE_CODE_ENTRYPOINT: 'cli',
  CLAUDE_CODE_EXECPATH: '/x/claude',
  CLAUDE_CODE_SESSION_ATTENDED: '1',
  CLAUDE_PID: '42',
  CLAUDE_EFFORT: 'high',
  FORCE_COLOR: '0',
};
const KEPT = {
  PATH: '/usr/bin',
  HOME: '/Users/x',
  COLORTERM: 'truecolor',
  TERM: 'xterm-256color',
  CLAUDE_CONFIG_DIR: '/Users/x/.claude-alt',
  ANTHROPIC_API_KEY: 'sk-ant',
  ANTHROPIC_BASE_URL: 'https://example.test',
};

describe('scrubHostAgentEnv', () => {
  it('strips every host-agent marker and keeps everything else', () => {
    expect(scrubHostAgentEnv({ ...LEAKED, ...KEPT })).toEqual(KEPT);
  });

  it('keeps FORCE_COLOR when it is not 0', () => {
    expect(scrubHostAgentEnv({ FORCE_COLOR: '1' })).toEqual({ FORCE_COLOR: '1' });
    expect(scrubHostAgentEnv({ FORCE_COLOR: '0' })).toEqual({});
  });

  it('does not mutate its input', () => {
    const input = { ...LEAKED, ...KEPT };
    scrubHostAgentEnv(input);
    expect(input.NO_COLOR).toBe('1');
  });
});

describe('scrubHostAgentProcessEnv', () => {
  it('deletes the markers in place and reports them', () => {
    const env: NodeJS.ProcessEnv = { ...LEAKED, ...KEPT };
    const removed = scrubHostAgentProcessEnv(env);
    expect(env).toEqual(KEPT);
    expect(removed).toContain('CLAUDE_CODE_MESSAGING_TOKEN');
    expect(removed).not.toContain('CLAUDE_CONFIG_DIR');
  });
});
