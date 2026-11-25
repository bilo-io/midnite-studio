import { useQuery } from '@tanstack/react-query';

import type { AgentProfilesHost } from '@midnite/studio-feature-agent-profiles/renderer';
import { bridge } from '@midnite/studio-frame';
import { ALL_APPS_INSTALLED, listMcpToolIds, MCP_TOOLS, modelsForAgent, type ChatSkill } from '@midnite/studio-shared';

import { resolveAgentIcon } from '../components/icons';
import { useAgents } from '../features/terminal/use-agents';
import { openExternal } from '../services/queries';
import { useUiStore } from '../store/ui-store';
import { STUDIO_MCP_TOOL_MANIFESTS } from './mcp-tool-manifests';

const NO_SKILLS: ChatSkill[] = [];

/** Every midnite tool Studio's server offers: the list an agent's allowlist picks from. Static for a build. */
const STUDIO_MCP_TOOLS = listMcpToolIds(ALL_APPS_INSTALLED, STUDIO_MCP_TOOL_MANIFESTS).map((id) => ({
  id,
  title: MCP_TOOLS[id].title,
  description: MCP_TOOLS[id].description,
}));

/**
 * Studio's side of the custom agents' host port (Phase 154 Theme C).
 *
 * `useLaunchProfile` and `useLiveSessionCount` are left out until Theme F lands them: the page then shows
 * no Launch button and counts no running sessions in the delete confirm.
 */
export const STUDIO_AGENT_PROFILES_HOST = {
  useAgentRoster: () => useAgents(),
  resolveAgentIcon,
  // Ollama models are not offered for a custom agent (Phase 154, "Not in this phase").
  useModelsFor: (baseAgentId) => modelsForAgent(baseAgentId),
  useSkills: (baseAgentId) => {
    const repoId = useUiStore((s) => s.selectedRepoId);
    const query = useQuery({
      queryKey: ['agent-profile-skills', baseAgentId, repoId],
      queryFn: async () => {
        const result = await bridge()?.chats.skills({ engine: baseAgentId, repoId: repoId ?? null });
        if (!result) return NO_SKILLS;
        if (!result.ok) throw new Error('message' in result ? result.message : 'The skills could not be read.');
        return result.value.skills;
      },
    });
    return { skills: query.data ?? NO_SKILLS, loading: query.isPending, error: query.error ? query.error.message : null };
  },
  useMcpTools: () => STUDIO_MCP_TOOLS,
  openExternal,
} satisfies AgentProfilesHost;
