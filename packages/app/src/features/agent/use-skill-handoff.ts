import {
  BUILTIN_AGENTS,
  type AgentDefinition,
  type RepoDescriptor,
  type TerminalSession,
} from '@midnite/studio-shared';
import { useCallback } from 'react';

import { primaryTarget } from '../repos/use-repo-actions';
import { startAgent } from '../terminal/start-agent';
import { useAgents } from '../terminal/use-agents';
import { DEFAULT_AGENT_SKILLS, useUiStore, type AgentCommandId } from '../../store/ui-store';
import { AGENT_COMMANDS } from './agent-commands';

export type SkillHandoffOptions = {
  skillId: AgentCommandId | (string & {});
  repo?: RepoDescriptor;
  repoId?: string;
  cwd?: string;
  body?: string;
  title?: string;
};

/**
 * Resolves the primary configured agent and launches a typed-not-sent terminal
 * session for a workflow skill against a repository.
 */
export function useSkillHandoff(): (opts: SkillHandoffOptions) => TerminalSession | null {
  const skills = useUiStore((s) => s.agentSkills);
  const primaryAgentId = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();

  return useCallback(
    (opts: SkillHandoffOptions): TerminalSession | null => {
      // Resolve agent: primary -> claude -> first builtin
      const agent: AgentDefinition | undefined =
        agents.find((a) => a.id === primaryAgentId) ??
        agents.find((a) => a.id === 'claude') ??
        BUILTIN_AGENTS[0];
      if (!agent) return null;

      const rawSkill = (skills as Record<string, string | undefined>)[opts.skillId];
      const defaultSkill = (DEFAULT_AGENT_SKILLS as Record<string, string | undefined>)[opts.skillId];
      const skillTemplate = (rawSkill ?? defaultSkill ?? '').trim();
      if (skillTemplate === '') {
        return null;
      }

      const repoId = opts.repoId ?? opts.repo?.id;
      if (!repoId) return null;
      const cwd =
        opts.cwd ??
        (opts.repo ? (primaryTarget(opts.repo).worktreePath ?? opts.repo.path) : undefined);
      if (!cwd) return null;

      const body = opts.body?.trim();
      const prompt = body ? `${skillTemplate} ${body}` : skillTemplate;

      const title =
        opts.title ??
        AGENT_COMMANDS.find((c) => c.id === opts.skillId)?.label ??
        opts.skillId;

      return startAgent({
        repoId,
        cwd,
        title,
        prompt,
        agentId: agent.id,
        command: agent.command,
        autoSend: false,
      });
    },
    [skills, primaryAgentId, agents],
  );
}
