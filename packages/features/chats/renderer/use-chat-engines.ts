import { useMemo } from 'react';

import { CHAT_ENGINE_OLLAMA, agentHeadlessArgs, loopModelsFor, type AgentDefinition, type AgentStatus } from '@midnite/studio-shared';
import { SiOllama } from 'react-icons/si';

import { useChatsHost } from './host';
import { type IconComponent } from '@midnite/studio-frame';

/**
 * The engines a chat can run on, as the composer's pickers and the explorer's
 * Engine filter see them: every roster agent that has a headless mode, plus
 * local Ollama.
 *
 * **Where "installed" comes from.** The shared agent probe store
 * (`features/agent/agent-probe-store.ts`), read through `useAgents().status` —
 * main probes at startup and on every reload. An agent is unavailable only when
 * the probe RAN and said it is not installed; `checking` / `unknown` assume it
 * works, so a probe that has not answered never disables an agent on the PATH.
 */

export type ChatEngineModel = { id: string; label: string; recommended?: boolean };

export type ChatEngine = {
  id: string;
  label: string;
  kind: 'agent' | 'ollama';
  icon: IconComponent;
  accent?: string;
  /** `false` greys the engine out in the picker, with `reason` as its title. */
  available: boolean;
  reason?: string;
  models: ChatEngineModel[];
  /** The model id meaning "the CLI's default" (agents) — mapped to `null` on the wire. */
  defaultModelId: string | null;
};

/** The wire's `null` model is the picker's `'default'` row for an agent. */
export const AGENT_DEFAULT_MODEL = 'default';

export function agentEngine(
  agent: AgentDefinition,
  status: readonly AgentStatus[],
  resolveAgentIcon: (agent: { id: string; icon?: string }) => IconComponent,
): ChatEngine {
  const probed = status.find((s) => s.id === agent.id);
  const installed = probed === undefined || probed.installed;
  const models = loopModelsFor(agent.id).map((m) => ({
    id: m.id,
    label: m.label,
    ...(m.id === AGENT_DEFAULT_MODEL ? { recommended: true } : {}),
  }));
  return {
    id: agent.id,
    label: agent.label,
    kind: 'agent',
    icon: resolveAgentIcon(agent),
    ...(agent.accent ? { accent: agent.accent } : {}),
    available: installed,
    ...(installed ? {} : { reason: `${agent.label} is not installed${agent.install ? ` — ${agent.install}` : ''}` }),
    models: models.length > 1 ? models : [],
    defaultModelId: AGENT_DEFAULT_MODEL,
  };
}

export function ollamaEngine(opts: { reachable: boolean; models: readonly string[] }): ChatEngine {
  return {
    id: CHAT_ENGINE_OLLAMA,
    label: 'Ollama (local)',
    kind: 'ollama',
    icon: SiOllama,
    available: opts.reachable && opts.models.length > 0,
    ...(opts.reachable
      ? opts.models.length > 0
        ? {}
        : { reason: 'No Ollama models are installed — pull one on the Models page' }
      : { reason: 'Ollama is not running' }),
    models: opts.models.map((name, i) => ({ id: name, label: name, ...(i === 0 ? { recommended: true } : {}) })),
    defaultModelId: opts.models[0] ?? null,
  };
}

/**
 * The engine a composer lands on: its remembered engine if still usable, then
 * the primary agent, then the first usable one, then whatever there is (so the
 * picker is never blank).
 */
export function pickEngine(engines: readonly ChatEngine[], wanted: string | null, primaryAgent: string): ChatEngine | null {
  const usable = engines.filter((e) => e.available);
  return (
    usable.find((e) => e.id === wanted) ??
    usable.find((e) => e.id === primaryAgent) ??
    usable[0] ??
    engines.find((e) => e.id === wanted) ??
    engines[0] ??
    null
  );
}

/** The wire model for a picker selection: agents' "default" row is `null`. */
export function wireModel(engine: ChatEngine, modelId: string | null): string | null {
  if (engine.kind === 'agent') return modelId === null || modelId === AGENT_DEFAULT_MODEL ? null : modelId;
  return modelId ?? engine.defaultModelId;
}

/** The picker's selected model id for a chat's stored (wire) model. */
export function pickerModel(engine: ChatEngine, model: string | null): string {
  if (engine.kind === 'agent') return model !== null && engine.models.some((m) => m.id === model) ? model : AGENT_DEFAULT_MODEL;
  return model !== null && engine.models.some((m) => m.id === model) ? model : (engine.defaultModelId ?? '');
}

export function useChatEngines(): { engines: ChatEngine[]; primaryAgent: string } {
  const host = useChatsHost();
  const { agents, status } = host.useAgentRoster();
  const primaryAgent = host.usePrimaryAgent();
  const { reachable, models: modelNames } = host.useLocalModels();

  const engines = useMemo(
    () => [
      ...agents.filter((a) => agentHeadlessArgs(a.id) !== null).map((a) => agentEngine(a, status, host.resolveAgentIcon)),
      ollamaEngine({ reachable, models: modelNames }),
    ],
    [agents, status, reachable, modelNames, host],
  );
  return { engines, primaryAgent };
}
