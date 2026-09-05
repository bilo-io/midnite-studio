/**
 * A loop's colour, as something CSS can actually paint with (Phase 39).
 *
 * `LoopDefinition.color` is a Tailwind *text* class (`text-blue-500`), which is
 * all the FAB tab bar and the status dots ever needed — but a `box-shadow` or
 * an `outline` cannot read a class, and the launcher strip needs both. So this
 * is the same resolution [`loop-icons.tsx`](./loop-icons.tsx) performs for the
 * icon token, for the same stated reason: `packages/shared` is the wire
 * contract and imports zod and nothing else, so a presentation hex cannot live
 * there.
 *
 * The values are the Tailwind palette entries the classes already name, so a
 * launcher and its FAB tab are the same colour by construction rather than by
 * coincidence. Adding a fifth loop means adding a row here — the accepted cost
 * of keeping colours out of the wire contract, exactly as `loop-icons.tsx`
 * already pays it for glyphs.
 *
 * Deliberately **not** merged with Phase 37's `--rainbow-N` ramp: that is an
 * ordered spectrum whose stops are positions, this is a lookup keyed by loop
 * id. Merging them would make each loop's colour a function of its index in
 * `DEFAULT_LOOPS`, which Phase 37's own decision 1 rejects.
 */
const LOOP_GLOW: Record<string, string> = {
  guard: '#22c55e', // green-500  — text-green-500
  innovate: '#06b6d4', // cyan-500   — text-cyan-500
  automate: '#3b82f6', // blue-500   — text-blue-500
  watchdog: '#8b5cf6', // violet-500 — text-violet-500
  medic: '#ef4444', // red-500    — text-red-500
  overhaul: '#f97316', // orange-500 — text-orange-500
};

/**
 * Amber, for a loop that is waiting on you.
 *
 * The same `#f59e0b` as `.loop-run-glow.is-waiting`, the FAB tab dot and
 * `fab-loop-halo.tsx`. A loop with a question on screen is the one you need,
 * and it has to look identical wherever it is shown.
 */
export const LOOP_WAITING_COLOR = '#f59e0b';

/**
 * An unknown id resolves to `currentColor` rather than throwing, mirroring
 * `loopIcon`'s neutral-dot fallback — a wrong colour is cosmetic, a crashed
 * status bar is not.
 */
export function loopGlowColor(loopId: string): string {
  return LOOP_GLOW[loopId] ?? 'currentColor';
}
