import { DEFAULT_LOOPS } from '@midnite/studio-shared';

import { useWindowFocused } from '../../lib/use-window-focus';
import type { FabTab } from '../../store/ui-store';
import { useAllLoopStatuses } from './loop-status';

const LOOP_IDS = DEFAULT_LOOPS.map((loop) => loop.id);

/**
 * The collapsed FAB's outer glow — the panel's inner rim, turned inside out.
 *
 * One halo behind the brand button while any loop is live, painted from the
 * same rainbow ramp the `.loop-run-glow` ring on the button spins, and cut to
 * the ACTIVE TAB's 180° of it by the same `--fab-arc-from`/`--fab-arc-to`
 * pair Phase 37 Theme C gives that tab's panel border — so the lit half of the
 * ring and the lit half of the halo are one arc, orbiting the button together.
 * It breathes on opacity and scale, the two properties that pulse without
 * re-running the blur each frame (Phase 36 Theme E's rule), at the cadence the
 * panel's rim keeps for the same loop state.
 *
 * This replaces the four per-loop corner glows. Those encoded *which* loops
 * were live, one fixed quarter each; the halo encodes the tab you are looking
 * at, exactly as the panel does when it is open, and the ring on the button
 * already said "something is live". Two glows competing in a ~50px annulus
 * read as neither.
 *
 * `data-fab-tab` is set on the halo ITSELF, not read from an ancestor: the arc
 * properties are `inherits: false`, and the tab table in `styles.css` keys on
 * the attribute, so this is what lets the same rows serve the panel, the
 * button and this span with no extra CSS.
 *
 * Amber still outranks the tab's colours when a loop is waiting on you — a
 * full, still ring rather than an arc, the convention `.loop-run-glow.is-waiting`,
 * the FAB tab dot and the launcher strip all keep. No loops running renders
 * nothing at all: the FAB is a button people press fifty times a day, and it
 * should look exactly as it did before whenever there is nothing to say.
 */
export function FabLoopHalo({ tab, compact = false }: { tab: FabTab; compact?: boolean }) {
  const { running, waiting, thinking } = useAnyLoopRunning();
  /*
    The pulse only runs while this window has focus, the gate Phase 36 Theme E
    put on every permanently-running animation. Blurred, the halo keeps its
    colour and its arc — only the breathing stops. The rotation is left alone:
    it belongs to `--loop-glow-angle`, which the `.loop-run-glow` ring on the
    very same button is already spinning under the same condition, and freezing
    one of the two would desynchronise them visibly.
  */
  const pulsing = useWindowFocused();
  if (!running) return null;

  return (
    <span
      aria-hidden
      data-testid="fab-loop-halo"
      data-fab-tab={tab}
      /*
        Behind the button, not over it. The halo's own disc is opaque and a
        little larger than the button, so what shows is the blurred collar
        escaping past the edge. `-z-10` sits inside the stacking context the
        FAB wrapper's `z-20` already establishes, so this goes under the brand
        mark without falling behind the app.

        `compact` is the statusbar's miniature FAB (`assistant-menu.tsx`):
        `.is-compact` shrinks the collar and its blur to match a button a
        quarter the size — the full-size inset/blur pair would read as a
        formless smear at 16px.
      */
      className={`fab-loop-halo pointer-events-none absolute -z-10 ${compact ? 'is-compact' : ''} ${waiting ? 'is-waiting' : ''} ${
        pulsing && !waiting ? 'is-pulsing' : ''
      } ${thinking ? 'is-thinking' : ''}`}
    />
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
