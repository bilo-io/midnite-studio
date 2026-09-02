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
