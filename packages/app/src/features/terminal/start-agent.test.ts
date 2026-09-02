import { beforeEach, describe, expect, it } from 'vitest';

import { agentInvocationArgs, startAgent, toAgentPrompt } from './start-agent';
import { useTerminalStore } from './terminal-store';

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

describe('startAgent — the words that reach the shell', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, pendingInput: {} });
  });

  function queued(over: Partial<Parameters<typeof startAgent>[0]> = {}): string {
    const session = startAgent({
      repoId: 'r1',
      cwd: '/repo',
      title: 'Patrol',
      prompt: '/loop /pr-review',
      agentId: 'claude',
      command: 'claude',
      surface: 'fab',
      ...over,
    });
    return useTerminalStore.getState().pendingInput[session.id] ?? '';
  }

  it('quotes the prompt as one word, with no extra flags by default', () => {
    expect(queued()).toBe("claude '/loop /pr-review'");
  });

  it('puts extra flags ahead of the prompt — a --model after it would be read as text', () => {
    expect(queued({ extraArgs: ['--model', 'claude-opus-5'] })).toBe(
      "claude --model claude-opus-5 '/loop /pr-review'",
    );
  });

  it('keeps the agent’s own invocation args after the extras and before the prompt', () => {
    expect(queued({ agentId: 'codex', command: 'codex', extraArgs: ['--sandbox'] })).toBe(
      "codex --sandbox exec '$loop $pr-review'",
    );
  });

  it('appends the Return only when the caller asked for one', () => {
    expect(queued({ autoSend: true }).endsWith('\r')).toBe(true);
    expect(queued().endsWith('\r')).toBe(false);
  });
});
