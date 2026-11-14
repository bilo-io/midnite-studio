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
  GIT_EDITOR: 'true',
  AI_AGENT: 'claude-code_2-1-325_agent',
  CLAUDE_CODE_INVOKED_SKILLS: 'a,b',
};
const KEPT = {
  PATH: '/usr/bin',
  HOME: '/Users/x',
  COLORTERM: 'truecolor',
  TERM: 'xterm-256color',
  CLAUDE_CONFIG_DIR: '/Users/x/.claude-alt',
  ANTHROPIC_API_KEY: 'sk-ant',
  ANTHROPIC_BASE_URL: 'https://example.test',
  CLAUDE_CODE_USE_BEDROCK: '1',
  CLAUDE_CODE_OAUTH_TOKEN: 'tok',
  CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8000',
};

describe('scrubHostAgentEnv', () => {
  it('strips every host-agent marker and keeps everything else', () => {
    expect(scrubHostAgentEnv({ ...LEAKED, ...KEPT })).toEqual(KEPT);
  });

  it('keeps FORCE_COLOR when it is not 0', () => {
    expect(scrubHostAgentEnv({ CLAUDECODE: '1', FORCE_COLOR: '1' })).toEqual({ FORCE_COLOR: '1' });
    expect(scrubHostAgentEnv({ CLAUDECODE: '1', FORCE_COLOR: '0' })).toEqual({});
  });

  it('keeps NO_COLOR, FORCE_COLOR=0 and GIT_EDITOR=true when no host marker is present', () => {
    const user = { NO_COLOR: '1', FORCE_COLOR: '0', GIT_EDITOR: 'true', PATH: '/usr/bin' };
    expect(scrubHostAgentEnv(user)).toEqual(user);
  });

  it('strips the gated keys with any one host marker', () => {
    const gated = { NO_COLOR: '1', FORCE_COLOR: '0', GIT_EDITOR: 'true' };
    expect(scrubHostAgentEnv({ ...gated, CLAUDECODE: '1' })).toEqual({});
    expect(scrubHostAgentEnv({ ...gated, CLAUDE_CODE_SESSION_ID: 'x' })).toEqual({});
    expect(scrubHostAgentEnv({ ...gated, AI_AGENT: 'claude-code/2.1/agent' })).toEqual({});
  });

  it('keeps a GIT_EDITOR that is not `true`, even with a host marker', () => {
    expect(scrubHostAgentEnv({ CLAUDECODE: '1', GIT_EDITOR: 'vim' })).toEqual({ GIT_EDITOR: 'vim' });
  });

  it('strips AI_AGENT only when it matches the Claude Code marker', () => {
    expect(scrubHostAgentEnv({ AI_AGENT: 'claude-code_2-1-325_agent' })).toEqual({});
    expect(scrubHostAgentEnv({ AI_AGENT: 'cursor' })).toEqual({ AI_AGENT: 'cursor' });
    expect(scrubHostAgentEnv({ AI_AGENT: 'claude-code_agent' })).toEqual({ AI_AGENT: 'claude-code_agent' });
  });

  it('keeps provider and auth config', () => {
    const cfg = { CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_OAUTH_TOKEN: 't', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '9' };
    expect(scrubHostAgentEnv({ ...cfg, CLAUDECODE: '1' })).toEqual(cfg);
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
    expect(removed).not.toContain('CLAUDE_CODE_USE_BEDROCK');
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('tok');
  });
});
