import { DEFAULT_LOOPS, isCustomLoopId, parseCustomLoops, type CustomLoop } from '@midnite/studio-shared';

/**
 * v35 -> v36: the FAB panel grew user-authored loops (`customLoops`). An
 * older blob has none, so the arm seeds an empty list — `??=` rather than `=`,
 * for the reason the v27 → v28 arm gives: a test profile seeded straight into
 * the persist key may already hold some. Mutates and returns the raw blob;
 * exported for its test.
 */
export function migrateCustomLoops(state: Record<string, unknown>): Record<string, unknown> {
  state.customLoops ??= [];
  return state;
}

/**
 * The load-time half: validate every saved loop with `CustomLoopSchema`
 * (dropping only the rows that fail, never the list), and pull an
 * `activeFabTab` naming a custom loop that is gone back onto the first
 * built-in — a tab id with no tab would leave the panel showing nothing.
 */
export function mergeCustomLoops(
  saved: { customLoops?: unknown; activeFabTab?: string },
  current: { customLoops: CustomLoop[]; activeFabTab: string },
): { customLoops: CustomLoop[]; activeFabTab?: 'guard' } {
  const customLoops = saved.customLoops === undefined ? current.customLoops : parseCustomLoops(saved.customLoops);
  const tab = saved.activeFabTab ?? current.activeFabTab;
  const known =
    !isCustomLoopId(tab) ? DEFAULT_LOOPS.some((loop) => loop.id === tab) : customLoops.some((loop) => loop.id === tab);
  return known ? { customLoops } : { customLoops, activeFabTab: 'guard' };
}

/** `record` without `key` — the same object back when there is nothing to drop. */
export function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _dropped, ...rest } = record;
  return rest;
}
