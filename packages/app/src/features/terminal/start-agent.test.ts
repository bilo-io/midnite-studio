import { describe, expect, it } from 'vitest';

import { agentInvocationArgs, toAgentPrompt } from './start-agent';

describe('toAgentPrompt', () => {
  it('leaves the prompt untouched for Claude and Antigravity — both read /name directly', () => {
    expect(toAgentPrompt('/midnite-exec', 'claude')).toBe('/midnite-exec');
    expect(toAgentPrompt('/midnite-exec', 'agy')).toBe('/midnite-exec');
  });

  it("rewrites every leading /token to $token for Codex, which doesn't recognise /name", () => {
    expect(toAgentPrompt('/midnite-exec', 'codex')).toBe('$midnite-exec');
    expect(toAgentPrompt('/loop /midnite-exec', 'codex')).toBe('$loop $midnite-exec');
  });

  it('leaves a plain-sentence prompt untouched for any agent', () => {
    expect(toAgentPrompt('fix the flaky retry test', 'codex')).toBe('fix the flaky retry test');
  });
});

describe('agentInvocationArgs', () => {
  it('adds nothing for Claude and OpenClaude — the prompt is their first interactive message', () => {
    expect(agentInvocationArgs('claude')).toEqual([]);
    expect(agentInvocationArgs('openclaude')).toEqual([]);
  });

  it('runs Antigravity non-interactively behind -p', () => {
    expect(agentInvocationArgs('agy')).toEqual(['-p']);
  });

  it('runs Codex non-interactively behind its exec subcommand', () => {
    expect(agentInvocationArgs('codex')).toEqual(['exec']);
  });

  it('runs OpenCode with --prompt for its initial message', () => {
    expect(agentInvocationArgs('opencode')).toEqual(['--prompt']);
  });
});
