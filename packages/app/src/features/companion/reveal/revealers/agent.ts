import { resourceRefLabel, type ResourceRef } from '@midnite/studio-shared';

import { bridge } from '../../../../services/bridge';
import { useSessionsStore } from '../../../../store/sessions-store';
import { useUiStore } from '../../../../store/ui-store';
import { useWorkflowRevealStore } from '../../../../store/workflow-reveal-store';
import { useChatsStore } from '@midnite/studio-feature-chats/renderer';
import { pushCouncilEntry } from '@midnite/studio-feature-councils/renderer';
import { useBoardSelectionStore } from '../../../tasks/board-selection-store';
import { revealSession } from '../../../terminal/reveal-session';
import type { FamilyRevealers, RevealOutcome } from '../types';

/**
 * Agent work — Phase 112 Theme D.
 *
 * Each revealer writes to a store the page reads, so the reveal holds whether
 * or not the page had mounted when it ran (the engine switches view one
 * render before it calls in). Nothing here sends, runs or resumes anything.
 */
export type AgentResourceKind = 'chat' | 'session' | 'council' | 'workflow' | 'board' | 'card';

const revealed = (ref: ResourceRef): RevealOutcome => ({
  ok: true,
  did: 'revealed',
  label: resourceRefLabel(ref),
});

const notFound = (say: string): RevealOutcome => ({ ok: false, reason: 'not-found', say });

export const AGENT_REVEALERS: FamilyRevealers<AgentResourceKind> = {
  chat: {
    view: 'chats',
    reveal: async (ref) => {
      const api = bridge();
      if (api) {
        const found = await api.chats.get({ id: ref.id });
        if (!found.ok) return notFound("I can't find that chat — it may have been deleted.");
      }
      useChatsStore.getState().select(ref.id);
      return revealed(ref);
    },
  },

  session: {
    // A live session lives in the terminal panel (no view switch); a closed one on Sessions.
    view: (ref) => (ref.closed ? 'sessions' : null),
    reveal: async (ref) => {
      if (ref.closed) {
        const sessions = useSessionsStore.getState();
        sessions.selectClosedSession(ref.id);
        sessions.selectLiveSession(null);
        return revealed(ref);
      }
      if (!revealSession(ref.id)) return notFound("That session isn't open any more.");
      return revealed(ref);
    },
  },

  council: {
    view: 'councils',
    reveal: async (ref) => {
      const api = bridge();
      if (api) {
        const { councils } = await api.council.list();
        if (!councils.some((council) => council.id === ref.id)) {
          return notFound("I can't find that council.");
        }
      }
      pushCouncilEntry(ref.id, ref.runId);
      return revealed(ref);
    },
  },

  workflow: {
    view: 'workflows',
    reveal: async (ref) => {
      const api = bridge();
      if (api) {
        const { workflows } = await api.workflow.list();
        if (!workflows.some((workflow) => workflow.id === ref.id)) {
          return notFound("I can't find that workflow.");
        }
      }
      const store = useWorkflowRevealStore.getState();
      store.select(ref.id);
      // The run rides as a pending request: the editor opens onto that run's
      // history detail once it mounts, then consumes it.
      if (ref.runId !== undefined) store.reveal({ workflowId: ref.id, runId: ref.runId });
      return revealed(ref);
    },
  },

  board: {
    view: 'tasks',
    reveal: async (ref) => {
      useUiStore.getState().setProjectBoard(ref.repoId, ref.projectId);
      return revealed(ref);
    },
  },

  card: {
    view: 'tasks',
    reveal: async (ref) => {
      const ui = useUiStore.getState();
      ui.setProjectBoard(ref.repoId, ref.projectId);
      // Only the board lays cards out where `BoardView` can scroll to them.
      ui.setProjectsMode(ref.repoId, 'board');
      useBoardSelectionStore.getState().revealCard(ref.repoId, ref.cardId);
      return revealed(ref);
    },
  },
};
