import {
  AGENT_PROFILE_ID_PREFIX,
  BUILTIN_AGENTS,
  modelsForAgent,
  resolveAgentAndModel,
  type AgentDefinition,
  type AgentProfile,
  type AgentStatus,
  type CompanionAgentGetOutput,
  type CompanionAgentSetOutput,
  type CompanionModelsListOutput,
} from '@midnite/studio-shared';

import { bridge } from '@midnite/studio-frame';
import { useUiStore } from './ext';
import { useAgentProbeStore } from './ext';
import { refreshCustomAgents } from './custom-agents';

/**
 * The renderer half of `companion_agent_get`, `companion_agent_set` and
 * `companion_models_list` (Phase 111 Theme E). Everything an agent can ask is
 * answered from the same places the title bar's picker reads — the roster, the
 * probe store, `primaryModelByAgent` — and written through the same
 * `setPrimaryAgentAndModel` action, so the two ways in cannot drift.
 */

/**
 * Ollama is a provider with a model list, not a roster entry — it is not in
 * `BUILTIN_AGENTS` — but `primaryAgent` can still name it (Phase 111 Theme A),
 * so a spoken or agent-sent "ollama" resolves to this stand-in.
 */
const OLLAMA_AGENT: AgentDefinition = { id: 'ollama', label: 'Ollama', command: 'ollama', args: [], accent: 'currentColor' };

function resolveAgent(input: string, agents: AgentDefinition[]): { agent: AgentDefinition } | { error: string } {
  if (input.trim().toLowerCase() === 'ollama' && !agents.some((a) => a.id === 'ollama')) return { agent: OLLAMA_AGENT };
  const resolved = resolveAgentAndModel(input, undefined, agents);
  if ('error' in resolved) return { error: resolved.error };
  const agent = agents.find((a) => a.id === resolved.agentId);
  return agent ? { agent } : { error: `Unknown agent: ${input.trim()}` };
}

async function loadRoster(): Promise<{ agents: AgentDefinition[]; status: AgentStatus[] }> {
  const listed = await bridge()?.agent.list();
  if (listed) return { agents: listed.agents, status: listed.status };
  return { agents: [...BUILTIN_AGENTS], status: useAgentProbeStore.getState().status };
}

/** Pulled Ollama models, and whether the daemon answered. Never throws: no bridge or a dead daemon is `running: false`. */
async function loadOllama(): Promise<{ running: boolean; models: string[] }> {
  try {
    const status = await bridge()?.ollama.status();
    if (!status?.reachable) return { running: false, models: [] };
    const listed = await bridge()?.ollama.list();
    return { running: true, models: listed?.ok ? listed.value.models.map((m) => m.name) : [] };
  } catch {
    return { running: false, models: [] };
  }
}

function installed(agentId: string, status: AgentStatus[]): boolean | null {
  return status.find((s) => s.id === agentId)?.installed ?? null;
}

export async function buildAgentStateReply(): Promise<CompanionAgentGetOutput> {
  const ui = useUiStore.getState();
  const [{ agents, status }, profiles] = await Promise.all([loadRoster(), refreshCustomAgents()]);
  return {
    primaryAgent: ui.primaryAgent,
    model: ui.primaryModelByAgent[ui.primaryAgent] ?? null,
    agents: agents.map((agent) => ({
      id: agent.id,
      label: agent.label,
      installed: installed(agent.id, status),
      model: ui.primaryModelByAgent[agent.id] ?? null,
    })),
    agentProfileId: ui.primaryAgentProfileId,
    customAgents: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      baseAgentId: profile.baseAgentId,
      installed: installed(profile.baseAgentId, status),
    })),
    locked: ui.screensaverLocked,
  };
}

/** A custom agent by id, or by its name (case-insensitive) — Phase 154 Theme H. */
function findCustomAgent(input: string, profiles: readonly AgentProfile[]): AgentProfile | null {
  const wanted = input.trim();
  if (wanted.startsWith(AGENT_PROFILE_ID_PREFIX)) return profiles.find((p) => p.id === wanted) ?? null;
  return profiles.find((p) => p.name.trim().toLowerCase() === wanted.toLowerCase()) ?? null;
}

function refused(reason: NonNullable<CompanionAgentSetOutput['reason']>, message: string): CompanionAgentSetOutput {
  return { status: 'refused', reason, message };
}

/** A model the user named against the catalogue, falling back to an exact match on what Ollama has pulled. */
function matchModel(
  agent: AgentDefinition,
  modelInput: string,
  agents: AgentDefinition[],
  ollamaModels: string[],
): { modelId: string } | { error: string } {
  const resolved = agent.id === 'ollama' ? null : resolveAgentAndModel(agent.id, modelInput, agents);
  if (resolved && 'modelId' in resolved && resolved.modelId) return { modelId: resolved.modelId };
  const wanted = modelInput.trim().toLowerCase();
  const pulled = ollamaModels.find((name) => name.toLowerCase() === wanted);
  if (pulled) return { modelId: pulled };
  return { error: `Unknown model: ${modelInput.trim()} for agent: ${agent.label}` };
}

export async function resolveAgentSet(input: { agent: string; model?: string | undefined }): Promise<CompanionAgentSetOutput> {
  const ui = useUiStore.getState();
  if (ui.screensaverLocked) return refused('locked', 'The screen is locked — unlock it first.');

  const [{ agents, status }, profiles] = await Promise.all([loadRoster(), refreshCustomAgents()]);
  const previous = {
    agentId: ui.primaryAgent,
    modelId: ui.primaryModelByAgent[ui.primaryAgent] ?? null,
    agentProfileId: ui.primaryAgentProfileId,
  };

  // Phase 154 Theme H: a custom agent by id or name, before the built-ins (the user chose that name).
  const custom = findCustomAgent(input.agent, profiles);
  if (custom) {
    if (input.model !== undefined) {
      return refused('unknownModel', `${custom.name} is a custom agent with its own model; change it on the Agents page.`);
    }
    if (installed(custom.baseAgentId, status) === false) {
      const base = agents.find((a) => a.id === custom.baseAgentId)?.label ?? custom.baseAgentId;
      return refused('notInstalled', `${custom.name} runs on ${base}, which is not installed on this machine.`);
    }
    ui.setPrimaryAgentProfile(custom.id);
    return { status: 'applied', previous, next: { ...previous, agentProfileId: custom.id } };
  }
  if (input.agent.trim().startsWith(AGENT_PROFILE_ID_PREFIX)) {
    return refused('unknownAgent', `No custom agent has the id ${input.agent.trim()}.`);
  }

  const target = resolveAgent(input.agent, agents);
  if ('error' in target) return refused('unknownAgent', target.error);
  const { agent } = target;
  if (installed(agent.id, status) === false) {
    return refused('notInstalled', `${agent.label} is not installed on this machine.`);
  }

  let modelId: string | null | undefined;
  if (input.model !== undefined) {
    const ollama = agent.id === 'ollama' ? await loadOllama() : { running: true, models: [] };
    if (agent.id === 'ollama' && !ollama.running) {
      return refused('ollamaDown', `Ollama is not running. Unable to switch to ${input.model}.`);
    }
    const match = matchModel(agent, input.model, agents, ollama.models);
    if ('error' in match) return refused('unknownModel', match.error);
    modelId = match.modelId;
  }

  ui.setPrimaryAgentAndModel(agent.id, modelId);
  const after = useUiStore.getState();
  return {
    status: 'applied',
    previous,
    next: { agentId: agent.id, modelId: after.primaryModelByAgent[agent.id] ?? null, agentProfileId: null },
  };
}

export async function buildModelsListReply(input: { agent?: string | undefined }): Promise<CompanionModelsListOutput> {
  const ui = useUiStore.getState();
  const { agents } = await loadRoster();
  let agentId = ui.primaryAgent;
  if (input.agent !== undefined) {
    const target = resolveAgent(input.agent, agents);
    if ('error' in target) return { agentId: null, models: [], selected: null, message: target.error };
    agentId = target.agent.id;
  }
  const isOllama = agentId === 'ollama';
  const ollama = isOllama ? await loadOllama() : null;
  return {
    agentId,
    models: modelsForAgent(agentId, ollama?.models).map((m) => ({
      id: m.id,
      label: m.label,
      ...(m.tier ? { tier: m.tier } : {}),
    })),
    selected: ui.primaryModelByAgent[agentId] ?? null,
    ...(ollama ? { ollamaRunning: ollama.running } : {}),
  };
}
