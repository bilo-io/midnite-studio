/**
 * v34 -> v35: the FAB tab bar's "Loop" switch (`loopEnabled`) became the one
 * control for `/loop` in the composed prompt, replacing the composer's own
 * `loopRunOptions[id].repeat`. Absent now reads as ON.
 *
 *   - an explicit `loopRunOptions[id].repeat` becomes `loopEnabled[id]` (it was
 *     the switch that actually controlled the prompt) and is removed from the
 *     run options;
 *   - any other stored `loopEnabled[id]` is dropped so it resolves on — until
 *     now that switch was cosmetic, so a stale `false` never meant "run once".
 *
 * Runs once, in the versioned `migrate`, so a switch the user turns off later
 * is never dropped again on the next rehydrate. Mutates and returns the raw
 * blob; exported for its test.
 */
export function migrateLoopSwitch(state: Record<string, unknown>): Record<string, unknown> {
  const runOptions = state.loopRunOptions as
    | Record<string, Record<string, unknown> | undefined>
    | undefined;
  const enabled: Record<string, boolean> = {};
  if (runOptions && typeof runOptions === 'object') {
    for (const [id, options] of Object.entries(runOptions)) {
      if (!options || typeof options !== 'object') continue;
      if (typeof options.repeat === 'boolean') enabled[id] = options.repeat;
      delete options.repeat;
    }
  }
  state.loopEnabled = enabled;
  return state;
}
