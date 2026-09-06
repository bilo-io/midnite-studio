import { useMemo } from 'react';

import { deriveCardGlowState, type CardGlowState } from '../board/glow-state';
import { sessionPhase, useTerminalStore } from '../../terminal/terminal-store';

/**
 * One `agent-run-glow` state per graph node, for the whole dependency canvas
 * in a single subscription (Phase 75 Theme F) — not one `useCardStatus` per
 * node the way `TaskCard` does it.
 *
 * `useCardStatus` (`board/use-card-status.ts`) takes three whole-slice
 * selectors and calls `findAnyCardSession`, a linear scan over every open
 * session (`terminal-store.ts`). That is fine for a column of tens of
 * cards; at the graph's 300-node cap it would be 300 subscriptions each
 * doing O(sessions) work on every store tick. This hook takes the same
 * three slices — `sessions`, `states`, `activity` — exactly once, walks
 * `sessions` a single time building `Map<itemId, CardGlowState>` through
 * the same `deriveCardGlowState` the card uses, and hands each node its own
 * entry as a plain prop. An agent started from the card composer lights the
 * node and the card simultaneously by construction, not coincidence.
 *
 * The board is **not** migrated onto this — `TaskCard` keeps `useCardStatus`;
 * a column holds tens of cards, not hundreds, and rewriting a working
 * surface is not this theme's business.
 *
 * Mirrors `findAnyCardSession`'s own "first match wins" semantics: a card
 * can have more than one `kanban` session bound to it over its lifetime (an
 * ended one, then a fresh one), and this walks `sessions` in the same order
 * `useCardStatus` would, taking the first bound to each item rather than
 * layering a different tie-break the board does not have.
 *
 * `isOpen` is always `false` here — the graph has no lifted card-selection
 * concept yet (that is Phase 75 Theme G, which needs the canvas on screen
 * first). A node whose pane is the one currently open will pick that up
 * once a future theme threads it through; until then this hook only ever
 * answers "is an agent running or waiting on this node", which is exactly
 * what is renderable before any node exists to render it on.
 */
export function useGraphAgentStates(projectId: string): ReadonlyMap<string, CardGlowState> {
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const activity = useTerminalStore((s) => s.activity);

  return useMemo(() => {
    const map = new Map<string, CardGlowState>();
    const seen = new Set<string>();

    for (const session of sessions) {
      if (session.surface !== 'kanban') continue;
      const taskRef = session.taskRef;
      if (taskRef === undefined || taskRef.projectId !== projectId) continue;
      if (seen.has(taskRef.itemId)) continue;
      seen.add(taskRef.itemId);

      const phase = sessionPhase(session, states[session.id]);
      const running = phase === 'live';
      const waiting = running && activity[session.id] === 'waiting';
      map.set(taskRef.itemId, deriveCardGlowState({ running, waiting, isOpen: false }));
    }

    return map;
  }, [sessions, states, activity, projectId]);
}
