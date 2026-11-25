import { access, readFile } from 'node:fs/promises';

import type { CompanionProfileRun } from '@midnite/studio-feature-companion/main';
import {
  BUILTIN_AGENTS,
  buildProfileHeadlessArgv,
  buildProfileHeadlessExtras,
  promptDeliveryFor,
  type AgentDefinition,
  type AgentProfile,
} from '@midnite/studio-shared';

import type { ProfileMcpSockets } from './profile-mcp-sockets';

export type ProfileHeadlessSeams = {
  sockets: Pick<ProfileMcpSockets, 'prepare' | 'bind' | 'close'>;
  /** The saved agent (`getAgentProfile`); `null` once it is deleted. */
  profile: (profileId: string) => Promise<AgentProfile | null>;
  /** The roster, overrides included (`listAgents`). */
  agents: () => Promise<AgentDefinition[]>;
  /** `agentProfilePromptPath(id)`: the file exists only when the composed prompt is not empty. */
  promptPath: (profileId: string) => string;
  /** Reads the prompt file; `null` when there is none. */
  readPrompt?: (path: string) => Promise<string | null>;
  exists?: (path: string) => Promise<boolean>;
  /** What the run is called in the audit trail, from its launch id. Default: the companion's. */
  runId?: (launchId: string) => string;
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const readText = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
};

/** What the run is called in the audit trail: the companion's, never a terminal session's. */
export const companionRunId = (launchId: string): string => `companion-${launchId}`;

/**
 * A custom agent as the companion's one headless ask (Phase 154 Theme H) — the argv counterpart of
 * `createProfileLaunchService`'s typed line, over the same private MCP socket (Theme G). The socket is bound
 * to the run at once (no pty will ever claim it) and `release` closes it when the run settles. Fails closed:
 * an agent that cannot run as itself answers `error`, and only a deleted one answers `missing`.
 */
export function createProfileHeadlessRun(seams: ProfileHeadlessSeams): (profileId: string, cwd: string) => Promise<CompanionProfileRun> {
  const exists = seams.exists ?? fileExists;
  const read = seams.readPrompt ?? readText;
  return async (profileId, cwd) => {
    const profile = await seams.profile(profileId);
    if (!profile) return { kind: 'missing' };
    const base = (await seams.agents()).find((agent) => agent.id === profile.baseAgentId);
    if (!base) {
      const label = BUILTIN_AGENTS.find((agent) => agent.id === profile.baseAgentId)?.label ?? profile.baseAgentId;
      return {
        kind: 'error',
        message: `${profile.name} runs on ${label}, which is not installed here. Pick another agent in the title bar.`,
      };
    }
    const path = seams.promptPath(profile.id);
    const promptPath = (await exists(path)) ? path : null;
    const delivery = promptDeliveryFor(base.id);
    const promptPrefix = promptPath !== null && delivery === 'argument' ? ((await read(promptPath))?.trim() || null) : null;
    // Checked before a socket is started, so a refusal leaves nothing to close.
    if (buildProfileHeadlessArgv({ base, model: profile.model, promptPath, launch: null, restricted: false }) === null) {
      return { kind: 'error', message: `${base.label} cannot answer in one go, so ${profile.name} cannot think for me. Pick another agent.` };
    }

    let prepared: Awaited<ReturnType<ProfileHeadlessSeams['sockets']['prepare']>>;
    try {
      prepared = await seams.sockets.prepare(profile, cwd);
    } catch (error) {
      return { kind: 'error', message: `I could not start ${profile.name}'s tools: ${error instanceof Error ? error.message : String(error)}` };
    }
    seams.sockets.bind(prepared.launchId, (seams.runId ?? companionRunId)(prepared.launchId));
    const argvInput = {
      base,
      model: profile.model,
      promptPath,
      launch: prepared.launch,
      restricted: profile.mcpTools !== null,
    };
    const args = buildProfileHeadlessArgv(argvInput) as string[];
    return {
      kind: 'ready',
      name: profile.name,
      agent: base,
      args,
      extraArgs: buildProfileHeadlessExtras(argvInput),
      promptPrefix,
      release: () => seams.sockets.close(prepared.launchId),
    };
  };
}
