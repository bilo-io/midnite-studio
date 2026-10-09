import { MUSIC_AGY_AGENT_ID, MUSIC_PASSES_DEFAULT, agentIteratesMusic, type LoopModel, type MusicAgentMode, type MusicEngine } from '@midnite/studio-shared';

import type { ChatEngine } from '../../../chats/use-chat-engines';

/**
 * Which of the Chats page's engines the song chat offers, and how each one writes (Phase 101
 * Theme I). The rule is main's (`modeFor` in `music-agents.ts`), restated from the same shared
 * predicates so the picker never promises a refine that main would run as one pass.
 */
export function engineMode(engineId: string, agyRegistered: boolean): MusicAgentMode {
  if (agentIteratesMusic(engineId)) return 'iterative';
  if (engineId === MUSIC_AGY_AGENT_ID && agyRegistered) return 'iterative';
  return 'single-pass';
}

export function modeHint(engineId: string, agyRegistered: boolean, passes = MUSIC_PASSES_DEFAULT): string {
  if (engineMode(engineId, agyRegistered) === 'iterative') return `Refines over up to ${passes} passes`;
  if (engineId === MUSIC_AGY_AGENT_ID) return 'Writes in one pass — register Midnite in Settings ▸ MCP to refine';
  return 'Writes the song in one pass';
}

/** The wire engine for a picker choice, or null when the choice cannot be sent. */
export function toMusicEngine(engine: ChatEngine | null, modelId: string | null): MusicEngine | null {
  if (!engine || !engine.available) return null;
  if (engine.kind === 'ollama') {
    const model = modelId ?? engine.defaultModelId;
    return model ? { kind: 'ollama', model } : null;
  }
  return { kind: 'agent', agentId: engine.id, ...(modelId && modelId !== 'default' ? { model: modelId as LoopModel } : {}) };
}
