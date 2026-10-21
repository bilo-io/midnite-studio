import type { MusicAgentProgressEvent } from '@midnite/studio-shared';

/**
 * "Pass n of N" and the latest tool action for the run in flight (Phase 101 Theme I). Main emits one
 * progress event per tool action; this folds them into what the composer shows. Events for any other
 * run are ignored, and a finished run stays finished however late its stragglers arrive.
 */
export type RunProgress = {
  runId: string;
  mode: 'iterative' | 'single-pass' | null;
  state: 'starting' | 'running' | 'done' | 'failed' | 'cancelled';
  /** Passes used so far, and the budget. */
  pass: number;
  max: number;
  /** The latest tool action, in words. */
  action: string | null;
};

export const startRun = (runId: string, max: number): RunProgress => ({ runId, mode: null, state: 'starting', pass: 0, max, action: null });

const settled = (s: RunProgress['state']): boolean => s === 'done' || s === 'failed' || s === 'cancelled';

export function reduceProgress(run: RunProgress | null, event: MusicAgentProgressEvent): RunProgress | null {
  if (!run || run.runId !== event.runId || settled(run.state)) return run;
  return {
    ...run,
    mode: event.mode,
    state: event.state,
    // Progress never runs backwards: a later event with a smaller pass keeps the high-water mark.
    pass: Math.max(run.pass, event.pass.n),
    max: event.pass.max,
    action: event.action ?? run.action,
  };
}

/** What the progress line says. A single-pass engine has no passes to count. */
export function progressLabel(run: RunProgress): string {
  if (run.mode === 'single-pass') return run.action ?? 'Writing the song';
  const pass = `Pass ${Math.min(run.pass + 1, run.max)} of ${run.max}`;
  return run.state === 'starting' ? 'Starting' : pass;
}
