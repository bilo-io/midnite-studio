import { loopModelsFor, type LoopModel } from '@midnite/studio-shared';
import { useEffect } from 'react';

import { useModelPrefs } from '../media/model/use-model';
import { useChatsStore } from '../chats/chats-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Phase 111 Theme F: a global agent/model change (voice, MCP, title-bar pill) reaches the
 * surfaces that keep their own remembered engine — the Chats composer's draft and the Media
 * Models tab's engine (which Sprites' map layout also reads). Only a *change* syncs; the first
 * run at startup leaves whatever each surface remembered alone.
 */

export type PrimarySelection = { agentId: string; model: string | null };

/** The active agent and its chosen model (`null` = the agent's own default). */
export function primarySelection(primaryAgent: string, byAgent: Readonly<Record<string, string | null>>): PrimarySelection {
  const model = byAgent[primaryAgent] ?? null;
  return { agentId: primaryAgent, model: model === 'default' ? null : model };
}

/** What the Chats composer draft becomes: the engine id and the wire model. */
export function chatDraftFor(sel: PrimarySelection): { engine: string; model: string | null } {
  return { engine: sel.agentId, model: sel.model };
}

/** What the Media Models tab's prefs become. An agent model outside the agent's loop list falls back to `default`. */
export function modelPrefsFor(sel: PrimarySelection): { engineId: string; agentModel?: LoopModel; ollamaModel?: string } {
  if (sel.agentId === 'ollama') return { engineId: 'ollama', ...(sel.model ? { ollamaModel: sel.model } : {}) };
  const known = loopModelsFor(sel.agentId).find((m) => m.id === sel.model);
  return { engineId: sel.agentId, agentModel: known ? known.id : 'default' };
}

export function useFollowPrimaryAgent(): void {
  useEffect(() => {
    let last = primarySelection(useUiStore.getState().primaryAgent, useUiStore.getState().primaryModelByAgent);
    return useUiStore.subscribe((state) => {
      const next = primarySelection(state.primaryAgent, state.primaryModelByAgent);
      if (next.agentId === last.agentId && next.model === last.model) return;
      last = next;
      useChatsStore.getState().setDraft(chatDraftFor(next));
      useModelPrefs.getState().set(modelPrefsFor(next));
    });
  }, []);
}
