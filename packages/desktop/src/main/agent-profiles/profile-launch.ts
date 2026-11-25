import { access } from 'node:fs/promises';

import type { AgentProfileLaunchService } from '@midnite/studio-feature-agent-profiles/main';
import { buildProfileLaunchLine, promptDeliveryFor, type AgentDefinition } from '@midnite/studio-shared';

import type { ProfileMcpSockets } from './profile-mcp-sockets';

export type ProfileLaunchSeams = {
  sockets: Pick<ProfileMcpSockets, 'prepare'>;
  /** The roster, overrides included (`listAgents`). */
  agents: () => Promise<AgentDefinition[]>;
  /** `agentProfilePromptPath(id)`: the file exists only when the composed prompt is not empty. */
  promptPath: (profileId: string) => string;
  exists?: (path: string) => Promise<boolean>;
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * `agentProfile:prepareLaunch` in Studio (Phase 154 Theme F): the one place a custom agent's typed line is
 * built. The renderer never builds one. The base CLI comes from the roster, the prompt from its file, and
 * the MCP words from the agent's private socket (Theme G).
 */
export function createProfileLaunchService(seams: ProfileLaunchSeams): AgentProfileLaunchService {
  const exists = seams.exists ?? fileExists;
  return {
    async prepare(profile, { cwd, resume, prompt }) {
      const base = (await seams.agents()).find((agent) => agent.id === profile.baseAgentId);
      if (!base) throw new Error(`The base CLI ${profile.baseAgentId} is not in the roster.`);
      const path = seams.promptPath(profile.id);
      const promptPath = (await exists(path)) ? path : null;
      const { launchId, mcpArgs } = await seams.sockets.prepare(profile, cwd);
      const line = buildProfileLaunchLine({
        base,
        model: profile.model,
        promptPath,
        delivery: promptDeliveryFor(base.id),
        mcpArgs,
        resume,
        prompt,
      });
      return { launchId, line };
    },
  };
}
