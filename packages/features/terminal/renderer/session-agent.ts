import type { AgentDefinition, AgentProfile, TerminalSession } from '@midnite/studio-shared';

/**
 * The agent a session wears in its chrome (Phase 154 Theme F): the base CLI, with its label, accent and
 * icon replaced by the custom agent's when the session runs one. A deleted agent falls back to the base
 * CLI's look. `agentId` overrides `session.agentId` (the live probe's answer); the overlay applies only
 * while that is still the custom agent's base CLI, since a shell that left the agent is not the agent.
 */
export function resolveSessionAgent(
  session: Pick<TerminalSession, 'agentId' | 'profileId'>,
  agents: readonly AgentDefinition[],
  profiles: readonly AgentProfile[] | undefined,
  agentId: string | null | undefined = session.agentId,
): AgentDefinition | undefined {
  const base = agentId ? agents.find((a) => a.id === agentId) : undefined;
  if (!base || !session.profileId) return base;
  const profile = profiles?.find((p) => p.id === session.profileId);
  if (!profile || profile.baseAgentId !== base.id) return base;
  return { ...base, label: profile.name, accent: profile.accent, ...(profile.icon ? { icon: profile.icon } : {}) };
}
