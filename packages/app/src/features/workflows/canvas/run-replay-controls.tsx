import type { WorkflowRun } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';
import { LuChevronLeft, LuChevronRight, LuPause, LuPlay, LuSkipBack, LuSkipForward } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';

/** Milliseconds between steps while playing — quick enough to feel like a replay, slow enough to actually read each node as it lights up. */
const REPLAY_STEP_MS = 600;

/**
 * Play/pause/step-through transport for a run's history (Phase 95 Theme I,
 * porting midnite's `run-history-panel.tsx` play/pause/prev/next/first/last
 * controls) — sits in the canvas toolbar while `workflows-view.tsx` is
 * showing a picked run (`mode === 'run'`), driving which of that run's
 * `WORKFLOW_NODE_KINDS` steps `run-replay.ts`'s `nodeStatusesAtStep` paints
 * onto the canvas. `step === total` (the default on selecting a run) is the
 * run's real final state; dragging or stepping back is what "replays" it.
 */
export function RunReplayControls({
  run,
  step,
  onStepChange,
}: {
  run: WorkflowRun;
  step: number;
  onStepChange: (step: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const total = run.nodes.length;

  // Playback auto-stops at the end rather than looping — a finished replay
  // sitting on the run's real final state is the useful thing to land on.
  useEffect(() => {
    if (!playing) return undefined;
    if (step >= total) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => onStepChange(step + 1), REPLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [onStepChange, playing, step, total]);

  // A run switch (a new `run.id`) resets playback rather than leaving a
  // stale `playing` flag ticking against the newly-selected run's own steps.
  useEffect(() => setPlaying(false), [run.id]);

  if (total === 0) return null;

  const togglePlay = () => {
    // Pressing Play once the scrubber is already at the end restarts the
    // replay from the top, rather than doing nothing (there is nothing left
    // to play from the final state).
    if (step >= total) {
      onStepChange(0);
      setPlaying(true);
      return;
    }
    setPlaying((prev) => !prev);
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton icon={LuSkipBack} label="First step" size="sm" onClick={() => onStepChange(0)} disabled={step === 0} />
      <IconButton
        icon={LuChevronLeft}
        label="Previous step"
        size="sm"
        onClick={() => onStepChange(Math.max(0, step - 1))}
        disabled={step === 0}
      />
      <IconButton
        icon={playing ? LuPause : LuPlay}
        label={playing ? 'Pause replay' : 'Play replay'}
        size="sm"
        onClick={togglePlay}
      />
      <IconButton
        icon={LuChevronRight}
        label="Next step"
        size="sm"
        onClick={() => onStepChange(Math.min(total, step + 1))}
        disabled={step >= total}
      />
      <IconButton icon={LuSkipForward} label="Last step" size="sm" onClick={() => onStepChange(total)} disabled={step >= total} />
      <input
        type="range"
        min={0}
        max={total}
        value={step}
        onChange={(event) => onStepChange(Number(event.target.value))}
        aria-label="Replay step"
        className="mx-1 h-1 w-20 accent-primary"
      />
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {step} / {total}
      </span>
    </div>
  );
}
