import { DEFAULT_LOOPS } from '@midnite/studio-shared';

import { useWindowFocused } from '../../lib/use-window-focus';
import { useAllLoopStatuses } from './loop-status';

const LOOP_IDS = DEFAULT_LOOPS.map((loop) => loop.id);

/**
 * One corner per loop, in `DEFAULT_LOOPS` order — Ideate top-left, Create
 * top-right, Patrol bottom-right, Medic bottom-left, clockwise from noon.
 *
 * Keyed on the loop's position in the roster rather than on how many happen to
 * be live, so a loop owns the same corner every time it runs: you learn where
 * Medic sits once, and a second loop starting never moves it. Packing the live
 * ones into the first N corners would have been tidier at one glance and
 * useless across two.
 */
const CORNERS = ['tl', 'tr', 'br', 'bl'] as const;

/**
 * Which loops are running, on the collapsed FAB.
 *
 * A quarter-ring of glow per live loop, one to a corner, each painted from that
 * loop's own slice of the rainbow ramp — the same 180° arc of it that Phase 37
 * Theme C gives the loop's FAB tab, so the corner and the panel border are the
 * same colours by construction. The slices rotate with `--loop-glow-angle` and
 * breathe on an opacity pulse, which is what separates a live corner from a
 * static coloured smudge at 40px.
 *
 * This replaces the four 6px dots that used to sit on the button's upper-left
 * arc. Colour-coded dots at that size read as specks of dirt on a brand mark;
 * a glow reads as the button being alive, which is the actual message. Amber
 * still outranks the loop's own colours when a loop is waiting on you — the
 * convention `.loop-run-glow.is-waiting`, the FAB tab dot and the launcher
 * strip all keep.
 *
 * No loops running renders nothing at all: the FAB is a button people press
 * fifty times a day, and it should look exactly as it did before whenever there
 * is nothing to say.
 */
export function FabLoopCorners() {
  const statuses = useAllLoopStatuses(LOOP_IDS);
  /*
    The pulse only runs while this window has focus, the gate Phase 36 Theme E
    put on every permanently-running animation. Blurred, a corner keeps its
    colour and its glow — only the breathing stops. The rotation is left alone:
    it belongs to `--loop-glow-angle`, which the `.loop-run-glow` ring on the
    very same button is already spinning under the same condition, and freezing
    one of the two would desynchronise them visibly.
  */
  const pulsing = useWindowFocused();
  const live = DEFAULT_LOOPS.map((loop, index) => ({
    loop,
    status: statuses[index],
    corner: CORNERS[index % CORNERS.length],
  })).filter((entry) => entry.status?.running);
  if (live.length === 0) return null;

  return (
    <span
      aria-hidden
      data-testid="fab-loop-corners"
      /*
        Behind the button, not over it. The layer's own disc is opaque and
        exactly the button's size, so the only part of it that should ever be
        seen is the halo bleeding past the edge. `-z-10` sits inside the
        stacking context the FAB wrapper's `z-20` already establishes, so this
        goes under the brand mark without falling behind the app.
      */
      className="pointer-events-none absolute inset-0 -z-10"
    >
      {live.map(({ loop, status, corner }) => (
        <span
          key={loop.id}
          data-testid={`fab-loop-corner-${loop.id}`}
          data-loop={loop.id}
          data-corner={corner}
          className={`fab-loop-corner ${status?.waiting ? 'is-waiting' : ''} ${
            pulsing && !status?.waiting ? 'is-pulsing' : ''
          }`}
        />
      ))}
    </span>
  );
}

/** Whether any loop is live — what puts the gradient glow on the FAB itself. */
export function useAnyLoopRunning(): { running: boolean; waiting: boolean; thinking: boolean } {
  const statuses = useAllLoopStatuses(LOOP_IDS);
  const waiting = statuses.some((s) => s.waiting);
  return {
    running: statuses.some((s) => s.running),
    waiting,
    // Waiting outranks thinking on one shared button: with four loops behind
    // it, "one of these needs you" is the more urgent of the two to show.
    thinking: !waiting && statuses.some((s) => s.thinking),
  };
}
