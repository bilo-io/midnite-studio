import { describe, expect, it } from 'vitest';

import { BUILTIN_AGENTS } from './terminal';
import {
  DEFAULT_SKILL_EXECUTION_MODE,
  SkillExecutionModeSchema,
  agentHeadlessArgs,
  agentInteractiveArgs,
  agentInvocationArgs,
} from './agent-invocation';

describe('SkillExecutionMode', () => {
  it('defaults to interactive', () => {
    expect(DEFAULT_SKILL_EXECUTION_MODE).toBe('interactive');
  });

  it('validates interactive and headless', () => {
    expect(SkillExecutionModeSchema.safeParse('interactive').success).toBe(true);
    expect(SkillExecutionModeSchema.safeParse('headless').success).toBe(true);
    expect(SkillExecutionModeSchema.safeParse('other').success).toBe(false);
  });
});

describe('agentInteractiveArgs', () => {
  it('returns verified interactive flags from docs/AGENTS_CLI.md', () => {
    expect(agentInteractiveArgs('agy')).toEqual(['--prompt-interactive']);
    expect(agentInteractiveArgs('opencode')).toEqual(['--prompt']);
    expect(agentInteractiveArgs('copilot')).toEqual(['suggest']);
    expect(agentInteractiveArgs('aider')).toEqual(['--message']);
    expect(agentInteractiveArgs('openclaude')).toEqual(['chat']);
    expect(agentInteractiveArgs('goose')).toEqual(['session', 'start', '--instruction']);

    // Bare / positional interactive prompt
    expect(agentInteractiveArgs('claude')).toEqual([]);
    expect(agentInteractiveArgs('codex')).toEqual([]);
    expect(agentInteractiveArgs('cursor')).toEqual([]);
    expect(agentInteractiveArgs('grok')).toEqual([]);
    expect(agentInteractiveArgs('cline')).toEqual([]);
    expect(agentInteractiveArgs('kilo')).toEqual([]);
    expect(agentInteractiveArgs('unknown-cli')).toEqual([]);
  });
});

describe('agentHeadlessArgs', () => {
  it('returns verified print/headless flags from docs/AGENTS_CLI.md', () => {
    expect(agentHeadlessArgs('claude')).toEqual(['-p']);
    expect(agentHeadlessArgs('cursor')).toEqual(['-p']);
    expect(agentHeadlessArgs('grok')).toEqual(['-p']);
    expect(agentHeadlessArgs('agy')).toEqual(['-p']);
    expect(agentHeadlessArgs('openclaude')).toEqual(['--bg']);
    expect(agentHeadlessArgs('opencode')).toEqual(['run']);
    expect(agentHeadlessArgs('kilo')).toEqual(['run']);
    expect(agentHeadlessArgs('codex')).toEqual(['exec']);
    expect(agentHeadlessArgs('copilot')).toEqual(['explain']);
    expect(agentHeadlessArgs('cline')).toEqual(['--auto-approve', 'true']);
    expect(agentHeadlessArgs('aider')).toEqual(['--yes-always', '--message']);
    expect(agentHeadlessArgs('goose')).toEqual(['run', '-t']);
  });

  it('returns null — not [] — for an agent with no known print mode', () => {
    expect(agentHeadlessArgs('something-a-user-added')).toBeNull();
    expect(agentHeadlessArgs('custom-agent')).toBeNull();
  });

  it('answers for every builtin roster agent', () => {
    for (const agent of BUILTIN_AGENTS) {
      const args = agentHeadlessArgs(agent.id);
      expect(args === null || Array.isArray(args)).toBe(true);
      expect(Array.isArray(args)).toBe(true);
    }
  });
});

describe('agentInvocationArgs', () => {
  it('defaults to interactive mode', () => {
    expect(agentInvocationArgs('agy')).toEqual(['--prompt-interactive']);
    expect(agentInvocationArgs('opencode')).toEqual(['--prompt']);
    expect(agentInvocationArgs('claude')).toEqual([]);
    expect(agentInvocationArgs('codex')).toEqual([]);
  });

  it('returns headless args when mode is headless', () => {
    expect(agentInvocationArgs('agy', 'headless')).toEqual(['-p']);
    expect(agentInvocationArgs('opencode', 'headless')).toEqual(['run']);
    expect(agentInvocationArgs('claude', 'headless')).toEqual(['-p']);
    expect(agentInvocationArgs('codex', 'headless')).toEqual(['exec']);
    expect(agentInvocationArgs('cursor', 'headless')).toEqual(['-p']);
    expect(agentInvocationArgs('grok', 'headless')).toEqual(['-p']);
    expect(agentInvocationArgs('copilot', 'headless')).toEqual(['explain']);
    expect(agentInvocationArgs('cline', 'headless')).toEqual(['--auto-approve', 'true']);
    expect(agentInvocationArgs('aider', 'headless')).toEqual(['--yes-always', '--message']);
    expect(agentInvocationArgs('openclaude', 'headless')).toEqual(['--bg']);
    expect(agentInvocationArgs('kilo', 'headless')).toEqual(['run']);
    expect(agentInvocationArgs('goose', 'headless')).toEqual(['run', '-t']);
  });

  it('falls back to interactive args when headless mode is unknown', () => {
    expect(agentInvocationArgs('unknown-cli', 'headless')).toEqual([]);
  });
});

