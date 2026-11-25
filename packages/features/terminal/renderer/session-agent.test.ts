import { BUILTIN_AGENTS, createBlankAgentProfile, type AgentProfile } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { resolveSessionAgent } from './session-agent';

const agents = [...BUILTIN_AGENTS];
const reviewer: AgentProfile = { ...createBlankAgentProfile(), id: 'ap-1', name: 'Reviewer', baseAgentId: 'claude', accent: '#112233', icon: 'codex' };

describe('resolveSessionAgent', () => {
  it("wears the custom agent's name, accent and icon over its base CLI", () => {
    const agent = resolveSessionAgent({ agentId: 'claude', profileId: 'ap-1' }, agents, [reviewer]);
    expect(agent).toMatchObject({ id: 'claude', command: 'claude', label: 'Reviewer', accent: '#112233', icon: 'codex' });
  });

  it('falls back to the base CLI once the agent is deleted', () => {
    expect(resolveSessionAgent({ agentId: 'claude', profileId: 'ap-1' }, agents, [])).toBe(agents.find((a) => a.id === 'claude'));
    expect(resolveSessionAgent({ agentId: 'claude', profileId: 'ap-1' }, agents, undefined)?.label).toBe('Claude');
  });

  it('leaves a plain session alone, and drops the overlay when the pane is running something else', () => {
    expect(resolveSessionAgent({ agentId: 'claude' }, agents, [reviewer])?.label).toBe('Claude');
    expect(resolveSessionAgent({ agentId: 'claude', profileId: 'ap-1' }, agents, [reviewer], 'codex')?.label).toBe('Codex');
    expect(resolveSessionAgent({ agentId: 'claude', profileId: 'ap-1' }, agents, [reviewer], null)).toBeUndefined();
  });
});
