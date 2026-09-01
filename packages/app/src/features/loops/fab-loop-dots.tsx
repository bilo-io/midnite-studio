import { DEFAULT_LOOPS } from '@midnite/studio-shared';

import { useAllLoopStatuses } from './loop-status';

const LOOP_IDS = DEFAULT_LOOPS.map((loop) => loop.id);

/**
 * Which loops are running, on the collapsed FAB (Phase 35 Theme E).
 *
 * Dots on the button's upper-left arc — one per live loop, in its own colour,
 * amber when that loop is waiting on you. Four is the cap by construction
 * (there are four loops), so the arc never has to reflow or overflow.
 *
 * No loops running renders nothing at all: the FAB is a button people press
 * fifty times a day, and it should look exactly as it did before this phase
 * whenever there is nothing to say.
 */
export function FabLoopDots() {
  const statuses = useAllLoopStatuses(LOOP_IDS);
  const live = DEFAULT_LOOPS.map((loop, index) => ({ loop, status: statuses[index] })).filter(
    (entry) => entry.status?.running,
  );
  if (live.length === 0) return null;

  return (
    <span aria-hidden data-testid="fab-loop-dots" className="pointer-events-none absolute inset-0">
      {live.map(({ loop, status }, index) => {
        // Quarter-circle from 12 o'clock anticlockwise to 9, just outside the
        // button's 40px edge — the corner the panel does not slide over.
        const angle = 180 + (index * 90) / Math.max(1, live.length - 1 || 1);
        const radians = (angle * Math.PI) / 180;
        return (
          <span
            key={loop.id}
            data-testid={`fab-loop-dot-${loop.id}`}
            className={`absolute h-1.5 w-1.5 rounded-full ${
              status?.waiting ? 'bg-amber-500' : `bg-current ${loop.color}`
            }`}
            style={{
              left: `calc(50% + ${(Math.cos(radians) * 24).toFixed(2)}px - 3px)`,
              top: `calc(50% + ${(Math.sin(radians) * 24).toFixed(2)}px - 3px)`,
            }}
          />
        );
      })}
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
