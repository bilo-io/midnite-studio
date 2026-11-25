/**
 * The custom-agents feature's internals, for tests that exercise it as a composing
 * app wires it. Not for production code.
 */
import { AgentProfileSchema, type AgentProfile, BUILTIN_AGENTS } from '@midnite/studio-shared';

import type { AgentProfilesHost } from './host';

export { AgentsView } from './agents-view';
export { AgentsList } from './agents-list';
export { AgentsInfo } from './agents-info';

/** A valid profile for a test, with any field overridden. */
export function profileFixture(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return AgentProfileSchema.parse({
    id: 'profile-fixture',
    name: 'Fixture',
    baseAgentId: 'claude',
    accent: '#8b5cf6',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });
}

/** A host over the built-in roster, every CLI installed, no launch. */
export const TEST_AGENT_PROFILES_HOST: AgentProfilesHost = {
  useAgentRoster: () => ({ agents: [...BUILTIN_AGENTS], status: BUILTIN_AGENTS.map((a) => ({ id: a.id, installed: true })) as never }),
  resolveAgentIcon: () => () => null,
  useModelsFor: () => [{ id: 'default', label: 'Default' }],
  useSkills: () => ({ skills: [], loading: false, error: null }),
  useMcpTools: () => [],
  openExternal: () => undefined,
};
