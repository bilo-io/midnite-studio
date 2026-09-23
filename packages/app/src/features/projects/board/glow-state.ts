import type { ActivityStatus } from '@midnite/studio-shared';

/**
 * A card's own glow state (Phase 41 Theme F) — three states, not one, and
 * kept pure so `useCardStatus`'s subscriptions never have to be mounted to
 * test the state machine itself.
 *
 * `'running'` — the card's agent has a live pty and nothing to ask. Pulsing.
 * `'waiting'` — the agent has a question on screen. Amber, no pulse — waiting
 * never decays (`activity-detect.ts`'s own rule: "a question left open for an
 * hour is still a question"), unlike `thinking`, which times out to idle.
 * `'open'` — no live agent, but this card's detail pane is the one open. A
 * static ring, so the open card is still findable in a busy board.
 * `'idle'` — none of the above. No glow at all.
 */
export type CardGlowState = 'running' | 'waiting' | 'open' | 'idle';

export function deriveCardGlowState({
  running,
  waiting,
  isOpen,
}: {
  running: boolean;
  waiting: boolean;
  isOpen: boolean;
}): CardGlowState {
  if (running && waiting) return 'waiting';
  if (running) return 'running';
  if (isOpen) return 'open';
  return 'idle';
}

/**
 * Bridges `useActivityGlow`'s nine-value `ActivityStatus` onto this file's
 * three-state ring (Phase 95 Theme C) — `TaskCard` and `ProjectGraphNode`
 * both call `useActivityGlow` now (not `deriveCardGlowState` directly, whose
 * `running`/`waiting` booleans used to come from an ad hoc terminal-store
 * read each caller made on its own), and this is what turns that richer
 * status back into the `.agent-run-glow`/`is-running|is-waiting|is-open`
 * paint both surfaces already wear.
 *
 * Deliberately still the legacy three-state ring, not a switch to
 * `.activity-glow`'s `data-activity-status` family: Theme A's own note
 * flagged that swap as its own visual product call — it would re-baseline
 * `kanban-card.spec.ts`'s two committed screenshots and rewrite
 * `kanban.spec.ts`'s `is-running` class assertions for a colour change (the
 * Brand preset's blue/violet/rose ring in place of the always-rainbow one),
 * not a correctness fix — and is left for a dedicated pass with a human
 * actually looking at the result. `deriveCardGlowState` above stays exactly
 * as it was (still directly tested) as the pure state machine this function
 * delegates to; the two real call sites just no longer read `running`/
 * `waiting` off the terminal store by hand to get there.
 */
export function cardGlowStateFromActivity(
  status: ActivityStatus,
  isOpenWithSession: boolean,
): CardGlowState {
  if (status === 'waiting') return 'waiting';
  if (status === 'agent' || status === 'thinking' || status === 'shell' || status === 'running') {
    return 'running';
  }
  return deriveCardGlowState({ running: false, waiting: false, isOpen: isOpenWithSession });
}
