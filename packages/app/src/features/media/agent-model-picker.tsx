import { loopModelsFor, type LoopModel } from '@midnite/studio-shared';

import { ProviderModelPicker, type PickerProvider } from '../../components/ai-thread';
import { resolveAgentIcon } from '../../components/icons';

/** The slice of an agent roster row the picker needs. */
export type PickerAgent = { id: string; label: string; icon?: string; accent?: string };

/** Picker rows for a roster of agents; the primary agent is the recommended default. */
export function agentPickerProviders(agents: readonly PickerAgent[], primaryAgentId: string): PickerProvider[] {
  return agents.map((a) => ({
    id: a.id,
    label: a.label,
    icon: resolveAgentIcon(a),
    ...(a.accent ? { color: a.accent } : {}),
    ...(a.id === primaryAgentId ? { recommended: true } : {}),
  }));
}

/**
 * The provider/model picker for Media's agent-backed composers (Docs ▸ Ask AI,
 * Video ▸ Edit): the provider is the headless agent, the model is that agent's
 * `LOOP_MODELS` list with "Default" as the recommended pick.
 */
export function AgentModelPicker({
  agents,
  primaryAgentId,
  agentId,
  onAgentChange,
  model,
  onModelChange,
  testId,
}: {
  agents: readonly PickerAgent[];
  primaryAgentId: string;
  agentId: string;
  onAgentChange: (id: string) => void;
  model: LoopModel;
  onModelChange: (model: LoopModel) => void;
  testId: string;
}) {
  const models = loopModelsFor(agentId).map((m) => ({ id: m.id, label: m.label, ...(m.id === 'default' ? { recommended: true } : {}) }));
  return (
    <ProviderModelPicker
      testId={testId}
      providers={agentPickerProviders(agents, primaryAgentId)}
      provider={agentId}
      onProviderChange={onAgentChange}
      models={models.length > 1 ? models : []}
      model={models.some((m) => m.id === model) ? model : 'default'}
      onModelChange={(id) => onModelChange(id as LoopModel)}
    />
  );
}
