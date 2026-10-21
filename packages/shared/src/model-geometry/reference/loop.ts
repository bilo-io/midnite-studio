/**
 * The reference-driven loop's decisions (Phase 104 Theme H), as pure functions so the stop rules are testable
 * without an agent: block in with SDF, convert to a mesh, correct whole regions, then refine by screen-space strokes
 * — each pass guided by the score, until the score reaches its target, plateaus, or the pass budget runs out.
 */

export const REFERENCE_LOOP_STAGES = ['block-in', 'convert', 'region', 'refine'] as const;
export type ReferenceLoopStage = (typeof REFERENCE_LOOP_STAGES)[number];

export type ReferenceLoopOptions = {
  /** Stop once the overall score reaches this; default 0.96. */
  target?: number;
  /** A pass that improves by less than this counts as no progress; default 0.01. */
  plateauEpsilon?: number;
  /** Consecutive no-progress passes that end the loop; default 2. */
  patience?: number;
  /** Below this the loop still corrects whole regions; above it, only screen-space refinement; default 0.9. */
  refineFrom?: number;
};

export type ReferenceLoopPlan =
  | { done: true; reason: 'target' | 'plateau' | 'budget'; best: number; passes: number; message: string }
  | { done: false; stage: ReferenceLoopStage; pass: number; remaining: number; best: number; message: string };

const STAGE_ADVICE: Record<ReferenceLoopStage, string> = {
  'block-in': 'Block the form in with model_sdf_set / model_sdf_patch / model_sdf_bake, matching the silhouette first.',
  convert: 'Convert any remaining primitives with model_convert_to_mesh so the form can be sculpted.',
  region: 'Fix the regions the comparison named with model_sculpt_stroke (target region or world) — big moves first.',
  refine: 'Refine with model_sculpt_stroke aimed on screen from the compared view; small, local corrections only.',
};

/**
 * Decides the next pass from the scores so far (`history[0]` is the first comparison, made before any pass).
 * `budget` is the number of passes the run may still spend in total, counted from the first comparison.
 */
export function planReferencePass(history: readonly number[], budget: number, options: ReferenceLoopOptions = {}): ReferenceLoopPlan {
  const target = options.target ?? 0.96;
  const epsilon = options.plateauEpsilon ?? 0.01;
  const patience = Math.max(1, options.patience ?? 2);
  const refineFrom = options.refineFrom ?? 0.9;
  const best = history.length ? Math.max(...history) : 0;
  const passes = Math.max(0, history.length - 1);
  if (history.length && history[history.length - 1]! >= target) {
    return { done: true, reason: 'target', best, passes, message: `Score ${best.toFixed(3)} reached the target ${target}. Save the model.` };
  }
  if (passes >= budget) {
    return { done: true, reason: 'budget', best, passes, message: `The pass budget (${budget}) is used. Save the model.` };
  }
  if (history.length > patience) {
    let stalled = 0;
    for (let i = history.length - 1; i > 0 && history[i]! - Math.max(...history.slice(0, i)) < epsilon; i -= 1) stalled += 1;
    if (stalled >= patience) {
      return { done: true, reason: 'plateau', best, passes, message: `The score has not improved by ${epsilon} in ${stalled} passes. Save the model.` };
    }
  }
  const last = history.length ? history[history.length - 1]! : 0;
  const stage: ReferenceLoopStage = passes === 0 ? 'block-in' : passes === 1 ? 'convert' : last < refineFrom ? 'region' : 'refine';
  return { done: false, stage, pass: passes + 1, remaining: budget - passes, best, message: STAGE_ADVICE[stage] };
}
