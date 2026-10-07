import type { ModelEngine } from '@midnite/studio-shared';

import { pickOllamaModel } from '../model/model-utils';
import { useModelPrefs, useModelProviders } from '../model/use-model';

/**
 * Who writes a map's layout (Phase 106 Theme J): the engine the Models tab is set to — Ollama with its
 * chosen model, or a roster agent — so there is one place to pick it, and the map form only names it.
 */
export function useMapEngine(): { engine: ModelEngine; label: string } {
  const prefs = useModelPrefs();
  const providers = useModelProviders();
  if (prefs.engineId === 'ollama' || !prefs.engineId) {
    const model = pickOllamaModel(providers.data?.ollama?.models ?? [], prefs.ollamaModel);
    return { engine: { kind: 'ollama', model }, label: `Ollama · ${model}` };
  }
  const engine: ModelEngine = { kind: 'agent', agentId: prefs.engineId, ...(prefs.agentModel !== 'default' ? { model: prefs.agentModel } : {}) };
  return { engine, label: prefs.agentModel !== 'default' ? `${prefs.engineId} · ${prefs.agentModel}` : prefs.engineId };
}
