import { loopModelsFor, type LoopModel } from '@midnite/studio-shared';
import { useEffect } from 'react';

import { useModelPrefs } from '@midnite/studio-feature-media-model/events';
import { useChatsStore } from '@midnite/studio-feature-chats/renderer';
import { useUiStore } from '../../store/ui-store';

/**
 * Phase 111 Theme F: a global agent/model change (voice, MCP, title-bar pill) reaches the
 * surfaces that keep their own remembered engine — the Chats composer's draft and the Media
 * Models tab's engine (which Sprites' map layout also reads). Only a *change* syncs; the first
 * run at startup leaves whatever each surface remembered alone.
 */

/** `profileId` is the custom agent the app is following (Phase 154), when one is chosen; `agentId` is then left alone. */
export type PrimarySelection = { agentId: string; model: string | null; profileId?: string };

/** The active agent and its chosen model (`null` = the agent's own default). */
export function primarySelection(
  primaryAgent: string,
  byAgent: Readonly<Record<string, string | null>>,
  profileId: string | null = null,
): PrimarySelection {
  const model = byAgent[primaryAgent] ?? null;
  return { agentId: primaryAgent, model: model === 'default' ? null : model, ...(profileId === null ? {} : { profileId }) };
}

/**
 * What the Chats composer draft becomes. A custom agent sets only `agentProfileId` (the composer resolves its
 * base CLI from the live list, and the agent's own model applies); a roster agent sets the engine and wire
 * model and clears any custom agent.
 */
export function chatDraftFor(sel: PrimarySelection): { engine?: string; agentProfileId: string | null; model: string | null } {
  if (sel.profileId !== undefined) return { agentProfileId: sel.profileId, model: null };
  return { engine: sel.agentId, agentProfileId: null, model: sel.model };
}

/** What the Media Models tab's prefs become. An agent model outside the agent's loop list falls back to `default`. */
export function modelPrefsFor(sel: PrimarySelection): { engineId: string; agentModel?: LoopModel; ollamaModel?: string } {
  if (sel.agentId === 'ollama') return { engineId: 'ollama', ...(sel.model ? { ollamaModel: sel.model } : {}) };
  const known = loopModelsFor(sel.agentId).find((m) => m.id === sel.model);
  return { engineId: sel.agentId, agentModel: known ? known.id : 'default' };
}

export function useFollowPrimaryAgent(): void {
  useEffect(() => {
    const read = (state: ReturnType<typeof useUiStore.getState>) =>
      primarySelection(state.primaryAgent, state.primaryModelByAgent, state.primaryAgentProfileId);
    let last = read(useUiStore.getState());
    return useUiStore.subscribe((state) => {
      const next = read(state);
      if (next.agentId === last.agentId && next.model === last.model && next.profileId === last.profileId) return;
      const profileOnly = next.agentId === last.agentId && next.model === last.model;
      last = next;
      useChatsStore.getState().setDraft(chatDraftFor(next));
      // The media tab has no custom agents: a change of custom agent alone leaves its engine as it was.
      if (!profileOnly) useModelPrefs.getState().set(modelPrefsFor(next));
    });
  }, []);
}
