import { describe, expect, it } from 'vitest';

import { AGENT_COMMAND_IDS, type AgentCommandId } from './agent-command';

describe('AGENT_COMMAND_IDS', () => {
  it('has 23 members, matching the roster with verifyPhase', () => {
    expect(AGENT_COMMAND_IDS.length).toBe(23);
  });

  it('has no duplicates', () => {
    expect(new Set(AGENT_COMMAND_IDS).size).toBe(AGENT_COMMAND_IDS.length);
  });

  it('includes both the base skills and the loop-prefixed ones', () => {
    expect(AGENT_COMMAND_IDS).toContain('prReview');
    expect(AGENT_COMMAND_IDS).toContain('loopPrReview');
  });

  it('is usable as an AgentCommandId value at the type level', () => {
    const id: AgentCommandId = AGENT_COMMAND_IDS[0];
    expect(AGENT_COMMAND_IDS).toContain(id);
  });
});
