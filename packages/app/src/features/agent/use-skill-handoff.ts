import {
  BUILTIN_AGENTS,
  type AgentDefinition,
  type RepoDescriptor,
  type TerminalSession,
  type TerminalSurface,
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
  /**
   * Where the session is hosted — see `startAgent`'s own doc for the enum.
   *
   * Absent means the main terminal panel, which is also what every caller
   * before Phase 79 wanted.
   */
  surface?: TerminalSurface;
  /**
   * Append the Return, so the composed command RUNS.
   *
   * **Defaults to `false`, and that default is the app's posture, not a
   * convenience** — see `start-agent.ts` for the full argument. Phase 79's
   * companion is the only caller that ever passes `true`, and only when the
   * hands-free switch is on *and* a speech provider is configured *and* it has
   * already spoken the command it is about to run. Three conditions, because
   * the withheld Return is the one thing standing between a misheard sentence
   * and an agent editing a repository.
   */
  autoSend?: boolean;
};

/**
 * What `skillHandoff` needs that a hook would otherwise have read from context.
 *
 * Extracted so the companion can hand a skill off from a plain function
 * (`features/companion/handoff.ts` runs from a store callback, long after any
 * component that could have called a hook has re-rendered), while the hook
 * below stays the one call site for every component.
 */
export type SkillHandoffContext = {
  /** `ui-store`'s `agentSkills` — user overrides for the skill strings. */
  skills: Record<string, string | undefined>;
  /** `ui-store`'s `primaryAgent`. */
  primaryAgentId: string;
  /** The roster, from `useAgents()` or a direct `agent.list()`. */
  agents: readonly AgentDefinition[];
};

/**
 * Resolve the configured agent and launch a typed-not-sent terminal session
 * for a workflow skill against a repository.
 *
 * The plain-function half of {@link useSkillHandoff}, so both a component and
 * a non-React caller share one implementation. Returns `null` rather than
 * throwing for every "cannot": no agent on the roster, no skill string for
 * this id, no repo, no working directory. Each is a real configuration state
 * and none of them is exceptional.
 */
export function skillHandoff(
  opts: SkillHandoffOptions,
  ctx: SkillHandoffContext,
): TerminalSession | null {
  // Resolve agent: primary -> claude -> first builtin
  const agent: AgentDefinition | undefined =
    ctx.agents.find((a) => a.id === ctx.primaryAgentId) ??
    ctx.agents.find((a) => a.id === 'claude') ??
    BUILTIN_AGENTS[0];
  if (!agent) return null;

  const rawSkill = ctx.skills[opts.skillId];
  const defaultSkill = (DEFAULT_AGENT_SKILLS as Record<string, string | undefined>)[opts.skillId];
  const skillTemplate = (rawSkill ?? defaultSkill ?? '').trim();
  if (skillTemplate === '') {
    return null;
  }

  const repoId = opts.repoId ?? opts.repo?.id;
  if (!repoId) return null;
  const cwd =
    opts.cwd ?? (opts.repo ? (primaryTarget(opts.repo).worktreePath ?? opts.repo.path) : undefined);
  if (!cwd) return null;

  const body = opts.body?.trim();
  const prompt = body ? `${skillTemplate} ${body}` : skillTemplate;

  const title =
    opts.title ?? AGENT_COMMANDS.find((c) => c.id === opts.skillId)?.label ?? opts.skillId;

  return startAgent({
    repoId,
    cwd,
    title,
    prompt,
    agentId: agent.id,
    command: agent.command,
    ...(opts.surface === undefined ? {} : { surface: opts.surface }),
    autoSend: opts.autoSend ?? false,
  });
}

/**
 * Resolves the primary configured agent and launches a typed-not-sent terminal
 * session for a workflow skill against a repository.
 */
export function useSkillHandoff(): (opts: SkillHandoffOptions) => TerminalSession | null {
  const skills = useUiStore((s) => s.agentSkills);
  const primaryAgentId = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();

  return useCallback(
    (opts: SkillHandoffOptions): TerminalSession | null =>
      skillHandoff(opts, {
        skills: skills as Record<string, string | undefined>,
        primaryAgentId,
        agents,
      }),
    [skills, primaryAgentId, agents],
  );
}
