import { useSyncExternalStore } from 'react';

/**
 * How a commit's agent provenance is drawn on the graph node.
 *
 * Three ways of answering the same question — "who else touched this commit" —
 * that differ only in how much of the node they are willing to spend on the
 * answer, which is a matter of taste rather than of correctness. So it is a
 * setting (Graph ▸ Agent provenance) rather than a fixed rule:
 *
 * - `badge`  the agent glyph as a small corner badge over the avatar's
 *            south-east quadrant. The default, and what shipped in Phase 78
 *            Theme C — the human face stays whole and legible, the badge is
 *            small enough to read as a decoration on it.
 * - `beside` the glyph in its own slot to the RIGHT of the gutter, larger than
 *            the badge because nothing overlaps it. Nothing is drawn on the
 *            node itself, so the face is untouched and the agent is a column of
 *            its own — the same trade the author column already makes.
 * - `swap`   the node alternates between the human face and the agent glyph
 *            every `PROVENANCE_SWAP_MS`, so both are eventually seen at full
 *            node size and neither is ever shrunk.
 */
export const PROVENANCE_MARK_MODES = ['badge', 'beside', 'swap'] as const;

export type ProvenanceMarkMode = (typeof PROVENANCE_MARK_MODES)[number];

export const DEFAULT_PROVENANCE_MARK_MODE: ProvenanceMarkMode = 'badge';

/**
 * Coerce a persisted id back into the union.
 *
 * Same contract as `graphTheme`: a value written by a future build (or by a
 * hand-edited `localStorage`) costs the default, never a crash.
 */
export const provenanceMarkMode = (id: string | null | undefined): ProvenanceMarkMode =>
  PROVENANCE_MARK_MODES.includes(id as ProvenanceMarkMode)
    ? (id as ProvenanceMarkMode)
    : DEFAULT_PROVENANCE_MARK_MODE;

/** How long each face is held in `swap` mode. */
export const PROVENANCE_SWAP_MS = 5_000;

/**
 * The `swap` clock, as ONE module-level interval shared by every row.
 *
 * A timer per row would mean ~30 of them while scrolling and — worse — thirty
 * independently-phased ones, so the visible nodes would flip at thirty
 * different moments instead of together. A single external store keeps the
 * whole column in step, and costs one `setInterval` for the entire list.
 *
 * It is started lazily by the first subscriber and cleared by the last, and it
 * stops again whenever the document is hidden — the same visibility gating the
 * rest of the app's ambient motion uses, and what `scripts/perf/idle-cpu.mjs
 * --blurred` measures. So a user on `badge` or `beside`, every non-graph view,
 * and a backgrounded window all pay nothing.
 */
let swapShowsAgent = false;
let swapTimer: ReturnType<typeof setInterval> | null = null;
const swapListeners = new Set<() => void>();

const documentHidden = (): boolean => typeof document !== 'undefined' && document.hidden;

function startSwapTimer(): void {
  if (swapTimer !== null || documentHidden()) return;
  swapTimer = setInterval(() => {
    swapShowsAgent = !swapShowsAgent;
    for (const listener of swapListeners) listener();
  }, PROVENANCE_SWAP_MS);
}

function stopSwapTimer(): void {
  if (swapTimer === null) return;
  clearInterval(swapTimer);
  swapTimer = null;
}

/*
  Re-read rather than toggled: `startSwapTimer` refuses to start while hidden,
  so one handler covers both directions and the "became visible with no
  subscribers left" case cannot resurrect a dead clock — the last unsubscribe
  removes this listener.
*/
function onSwapVisibilityChange(): void {
  if (documentHidden()) stopSwapTimer();
  else startSwapTimer();
}

function subscribeSwap(onChange: () => void): () => void {
  swapListeners.add(onChange);
  if (swapListeners.size === 1) {
    document.addEventListener('visibilitychange', onSwapVisibilityChange);
  }
  startSwapTimer();
  return () => {
    swapListeners.delete(onChange);
    if (swapListeners.size === 0) {
      document.removeEventListener('visibilitychange', onSwapVisibilityChange);
      stopSwapTimer();
      // Reset, so the next visit to the graph starts on the human face rather
      // than wherever the clock happened to stop.
      swapShowsAgent = false;
    }
  };
}

const swapSnapshot = (): boolean => swapShowsAgent;

/** Subscribing is a no-op unless `swap` is the active mode — see `useProvenanceSwap`. */
const neverSubscribe = (): (() => void) => () => {};
const alwaysFalse = (): boolean => false;

/**
 * `true` while the agent glyph is the face, `false` while the human avatar is.
 *
 * Takes `enabled` rather than being called conditionally because hooks cannot
 * be: passing `false` swaps in a store that never changes, which is how a row
 * on `badge` avoids subscribing to the clock at all.
 */
export function useProvenanceSwap(enabled: boolean): boolean {
  return useSyncExternalStore(
    enabled ? subscribeSwap : neverSubscribe,
    enabled ? swapSnapshot : alwaysFalse,
    alwaysFalse,
  );
}

/** Test seam: drop the clock and its listeners between specs. */
export function resetProvenanceSwapForTests(): void {
  stopSwapTimer();
  document.removeEventListener('visibilitychange', onSwapVisibilityChange);
  swapListeners.clear();
  swapShowsAgent = false;
}
