import { describe, expect, it } from 'vitest';

import { AgentLimitsSchema, AgentLimitsSettingsSchema, DEFAULT_AGENT_LIMITS, resolveAgentLimits } from './agent-limits';

describe('agent limits', () => {
  it('defaults are the generous ones the phase names', () => {
    expect(DEFAULT_AGENT_LIMITS).toMatchObject({ toolCallsPerMinute: 120, fileWritesPerMinute: 300, gitPushesPerHour: 10 });
    expect(AgentLimitsSchema.safeParse({ toolCallsPerMinute: 0 }).success).toBe(false);
  });

  it('a repo override beats the global one, which beats the defaults; the longest repo path wins', () => {
    const settings = AgentLimitsSettingsSchema.parse({
      defaults: { gitPushesPerHour: 20 },
      repos: { '/work': { toolCallsPerMinute: 60 }, '/work/app': { toolCallsPerMinute: 30, spendTokensPerSession: null } },
    });
    expect(resolveAgentLimits(settings, '/elsewhere')).toMatchObject({ toolCallsPerMinute: 120, gitPushesPerHour: 20 });
    expect(resolveAgentLimits(settings, '/work/other')).toMatchObject({ toolCallsPerMinute: 60, gitPushesPerHour: 20 });
    expect(resolveAgentLimits(settings, '/work/app/pkg')).toMatchObject({ toolCallsPerMinute: 30, spendTokensPerSession: null });
    expect(resolveAgentLimits(settings, '/work-two')).toMatchObject({ toolCallsPerMinute: 120 });
    expect(resolveAgentLimits(undefined, '/work')).toEqual(DEFAULT_AGENT_LIMITS);
  });
});
