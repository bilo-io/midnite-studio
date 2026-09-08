import { describe, expect, it } from 'vitest';

import { BUILTIN_AGENTS } from './terminal';
import { agentHeadlessArgs, agentInvocationArgs } from './agent-invocation';

/**
 * `agentHeadlessArgs` is the one of these two that can hang the app, so it is
 * the one with a test — Phase 79 Theme E.
 *
 * The failure it guards against is not a wrong flag, it is a *guessed* one: an
 * unknown CLI spawned with `-p` either rejects the flag (fine, the envelope
 * says so) or ignores it and waits for input that `runProcess` never sends,
 * holding a companion turn until the 30 s deadline. So the assertion that
 * matters is that an agent with no known print mode answers `null` rather than
 * an empty array.
 */
describe('agentHeadlessArgs', () => {
  it("returns Claude's print flag, where agentInvocationArgs deliberately returns nothing", () => {
    expect(agentHeadlessArgs('claude')).toEqual(['-p']);
    // The contrast is the point: a pty session hands Claude the prompt as a
    // bare positional and lets it open its REPL.
    expect(agentInvocationArgs('claude')).toEqual([]);
  });

  it('agrees with agentInvocationArgs for the CLIs that are already one-shot', () => {
    for (const id of ['agy', 'codex', 'opencode']) {
      expect(agentHeadlessArgs(id)).toEqual(agentInvocationArgs(id));
    }
  });

  it('returns null — not [] — for an agent with no known print mode', () => {
    expect(agentHeadlessArgs('cursor')).toBeNull();
    expect(agentHeadlessArgs('copilot')).toBeNull();
    expect(agentHeadlessArgs('something-a-user-added')).toBeNull();
  });

  it('answers for every builtin, one way or the other', () => {
    for (const agent of BUILTIN_AGENTS) {
      const args = agentHeadlessArgs(agent.id);
      expect(args === null || Array.isArray(args)).toBe(true);
    }
  });

  it('names at least one builtin the companion can actually run headlessly', () => {
    expect(BUILTIN_AGENTS.some((agent) => agentHeadlessArgs(agent.id) !== null)).toBe(true);
  });
});
