import type { WorkflowRun } from '@midnite/studio-shared';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { totalIterations } from './run-replay-iteration';

/**
 * The iteration scrubber (Phase 97 Theme K) — "pass 2 of 3", sitting beside
 * `RunReplayControls` in the canvas toolbar. Picking a pass is independent
 * of the flat step scrubber: `workflows-view.tsx` clears whichever of the two
 * overrides isn't the one just touched, so only one drives the canvas at a
 * time.
 *
 * `iteration === null` reads as "no override" — the caller shows the run's
 * own final state (or wherever the flat scrubber has it parked). Pressing
 * a step button here always lands on a real 1..N pass, never back to
 * `null` — "Show final" is what the flat scrubber's own "Last step" already
 * means, so this control doesn't duplicate it.
 */
export function IterationScrubber({
  run,
  iteration,
  onIterationChange,
}: {
  run: WorkflowRun;
  iteration: number | null;
  onIterationChange: (iteration: number | null) => void;
}) {
  const total = totalIterations(run);
  if (total <= 1) return null;

  const current = iteration ?? total;

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1.5" title="Replay a single loop pass">
      <IconButton
        icon={LuChevronLeft}
        label="Previous pass"
        size="sm"
        onClick={() => onIterationChange(Math.max(1, current - 1))}
        disabled={current <= 1}
      />
      <span className="text-[11px] tabular-nums text-muted-foreground">
        Pass {current} of {total}
      </span>
      <IconButton
        icon={LuChevronRight}
        label="Next pass"
        size="sm"
        onClick={() => onIterationChange(Math.min(total, current + 1))}
        disabled={current >= total}
      />
    </div>
  );
}
