import type { GameHost } from '@midnite/studio-feature-media-game/renderer';
import type { GameSummary } from '@midnite/studio-shared';
import { useCallback } from 'react';

import { Popover } from '../components/popover';
import { useToasts } from '../components/toast-host';
import { bridge } from '../services/bridge';
import { useUiStore } from '../store/ui-store';
import { useGameAgentEvents, useGameAgentStore } from './media-game/game-agent-store';
import { GameEngineFields, GameIteratePanel, startGameAgentRun, useGameEngines } from './media-game/game-iterate-panel';

/**
 * Opens the game's repo in Timeline: registers it with the repo list if the app somehow lost it, selects
 * it, and switches view. A game is a normal repo, so commits (and agent passes) show up there like any other.
 */
export async function openGameInTimeline(game: GameSummary): Promise<void> {
  const api = bridge();
  if (!api) return;
  const repos = await api.repos.list();
  let repoId = repos.find((repo) => repo.path === game.path)?.id ?? null;
  if (!repoId) {
    const opened = await api.repos.open({ path: game.path });
    if (opened.ok) repoId = opened.repo.id;
  }
  if (!repoId) return;
  const ui = useUiStore.getState();
  ui.selectRepo(repoId);
  ui.setActiveView('graph');
}

/** Starts a run with the engine and passes currently picked — what the create form's first prompt calls. */
function useStartRun(): (gameId: string, prompt: string) => Promise<boolean> {
  const { choice } = useGameEngines();
  const passes = useGameAgentStore((s) => s.passes);
  return useCallback((gameId, prompt) => startGameAgentRun(gameId, prompt, choice, passes), [choice, passes]);
}

function useNotify(): (message: string, options?: { danger?: boolean }) => void {
  const toasts = useToasts();
  return useCallback((message, options) => toasts.show({ message, ...(options?.danger ? { danger: true } : {}) }), [toasts]);
}

/**
 * Studio's side of the Game feature's host port (Phase 113 Theme S).
 *
 * The agent surfaces stay in Studio (`compose/media-game/`): create-and-iterate needs the agent roster,
 * the model providers and the AI composer. So do the Timeline, the dismiss stack's occluder count (a
 * native game view floats above the DOM and must hide while any dialog or menu is open) and Studio's
 * popover, which registers in that stack.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`) and by the detached `game` window
 * (`detached-root.tsx`), not by `StudioProviders`, for the entry-chunk reason the other tab hosts give.
 */
export const STUDIO_GAME_HOST = {
  openInTimeline: openGameInTimeline,
  pickDirectory: async () => (await bridge()?.repos.pickDirectory()) ?? null,
  useNotify,
  useOccluded: () => useUiStore((s) => s.occluders > 0),
  Popover,
  agent: {
    useEvents: useGameAgentEvents,
    EngineFields: GameEngineFields,
    useStartRun,
    IteratePanel: GameIteratePanel,
  },
} satisfies GameHost;
