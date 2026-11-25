import type { AgentProfileLaunchService } from '@midnite/studio-feature-agent-profiles/main';
import type { WorkflowProfileLaunch } from '@midnite/studio-feature-workflows/main';
import { toAgentPrompt, type AgentProfile } from '@midnite/studio-shared';

export type WorkflowProfileLaunchSeams = {
  /** The saved agent (`getAgentProfile`); `null` once it is deleted. */
  profile: (profileId: string) => Promise<AgentProfile | null>;
  /** The one service behind `agentProfile:prepareLaunch`. */
  launch: AgentProfileLaunchService;
};

/**
 * A workflow `agent` node's custom agent (#1699): the same typed line the terminal's `+` menu gets, with the
 * node's task as its first prompt. Only a deleted agent answers `missing` (the node runs as its roster agent);
 * any other refusal is an `error`, so the node fails instead of running the base CLI without the agent's tools.
 */
export function createWorkflowProfileLaunch(
  seams: WorkflowProfileLaunchSeams,
): (profileId: string, cwd: string, prompt: string) => Promise<WorkflowProfileLaunch> {
  return async (profileId, cwd, prompt) => {
    const profile = await seams.profile(profileId);
    if (!profile) return { kind: 'missing' };
    try {
      const { launchId, line } = await seams.launch.prepare(profile, {
        cwd,
        resume: false,
        prompt: toAgentPrompt(prompt, profile.baseAgentId),
      });
      return { kind: 'ready', launchId, line, name: profile.name, baseAgentId: profile.baseAgentId };
    } catch (error) {
      return { kind: 'error', message: `${profile.name} could not start: ${error instanceof Error ? error.message : String(error)}` };
    }
  };
}
