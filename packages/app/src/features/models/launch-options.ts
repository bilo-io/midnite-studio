import { agentFitness, effectiveContextLength, supportsOllamaBackend } from '@midnite/studio-shared';

import type { StartAgentModelOverride } from '../terminal/start-agent';
import { useOllamaModels, useOllamaShow } from './use-models';

/**
 * The per-launch "Ollama" group (Phase 96 Theme I) that the card composer and
 * the loop composer add beside `LOOP_MODELS`. An option id is the model name
 * behind a prefix, so it can never collide with a `LoopModel` token and a
 * picker's single `value` string still says which of the two it holds.
 */
export const OLLAMA_OPTION_PREFIX = 'ollama:';

export function ollamaOptionId(model: string): string {
  return `${OLLAMA_OPTION_PREFIX}${model}`;
}

/** The Ollama model a picker value names, or `null` for a `LoopModel` token. */
export function ollamaModelFromOption(value: string): string | null {
  return value.startsWith(OLLAMA_OPTION_PREFIX) ? value.slice(OLLAMA_OPTION_PREFIX.length) || null : null;
}

/** `startAgent`'s `modelOverride` for a picker value — only an Ollama pick overrides. */
export function launchOverrideFor(value: string): StartAgentModelOverride | undefined {
  const model = ollamaModelFromOption(value);
  return model ? { backend: 'ollama', model } : undefined;
}

/**
 * The installed models to offer `agentId`, as `{id, label}` rows — empty for
 * an agent with no Ollama backend, so a picker can spread it unconditionally.
 */
export function useOllamaLaunchOptions(agentId: string): { id: string; label: string }[] {
  const { data: models } = useOllamaModels();
  if (!supportsOllamaBackend(agentId)) return [];
  return (models ?? []).map((m) => ({ id: ollamaOptionId(m.name), label: `Ollama · ${m.name}` }));
}

/**
 * The fit badge for a picked Ollama model — `null` until its `show` lands, or
 * when the pick is not an Ollama model. Same `agentFitness` verdict the detail
 * modal and Settings ▸ Agent use.
 */
export function useOllamaLaunchFit(value: string): { fit: boolean; reasons: string[] } | null {
  const model = ollamaModelFromOption(value);
  const { data: detail } = useOllamaShow(model);
  if (!model || !detail) return null;
  return agentFitness(detail, effectiveContextLength(detail));
}
