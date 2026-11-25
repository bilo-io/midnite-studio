import { createContext, useContext, type ReactNode } from 'react';

import type { IconComponent } from '@midnite/studio-frame';
import type { AgentDefinition, AgentModelInfo, AgentProfile, AgentStatus, ChatSkill, McpToolId } from '@midnite/studio-shared';

/**
 * The custom-agents feature's host port (Phase 154 Theme C) — what the page needs from the app that
 * composes it, beyond the frame: the agent roster, its models, skills and the MCP tool list, and
 * (Studio only, filled by Phase 154 Theme F) launching a profile and counting its live sessions.
 *
 * `useLaunchProfile` and `useLiveSessionCount` are optional: an app without them shows no Launch
 * button and counts no running sessions in the delete confirm.
 */
export type AgentProfilesHost = {
  /** The agent roster and what main could learn about it on this machine. A hook. */
  useAgentRoster: () => { agents: AgentDefinition[]; status: AgentStatus[] };
  /** The glyph for an agent (its brand mark, or a fallback for an unknown one). */
  resolveAgentIcon: (agent: { id: string; icon?: string }) => IconComponent;
  /** The models a base CLI offers. A hook; Ollama models are excluded. */
  useModelsFor: (baseAgentId: string) => AgentModelInfo[];
  /** The skills a base CLI can see. A hook. */
  useSkills: (baseAgentId: string) => { skills: ChatSkill[]; loading: boolean; error: string | null };
  /** The midnite MCP tools an agent may be restricted to. A hook. */
  useMcpTools: () => { id: McpToolId; title: string; description: string }[];
  /** Starts a session for a profile. A hook; absent until Theme F, and absent in Agents. */
  useLaunchProfile?: () => { launch: (profile: AgentProfile) => Promise<void>; disabledReason: string | null };
  /** How many sessions of a profile are running. A hook; absent until Theme F. */
  useLiveSessionCount?: (profileId: string) => number;
  /** Opens a URL in the user's browser. */
  openExternal: (url: string) => void;
};

const AgentProfilesHostContext = createContext<AgentProfilesHost | null>(null);

export function AgentProfilesHostProvider({ host, children }: { host: AgentProfilesHost; children: ReactNode }) {
  return <AgentProfilesHostContext.Provider value={host}>{children}</AgentProfilesHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the page would have no roster. */
export function useAgentProfilesHost(): AgentProfilesHost {
  const host = useContext(AgentProfilesHostContext);
  if (!host) throw new Error('The agent-profiles feature must be rendered inside <AgentProfilesHostProvider>');
  return host;
}
