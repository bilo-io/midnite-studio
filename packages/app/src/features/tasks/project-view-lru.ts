/**
 * Bounding `projectViewByProject` (Phase 52 Theme D) so a user who opens many
 * projects over time does not accumulate localStorage indefinitely.
 *
 * Relies on a spec guarantee rather than a second bookkeeping array: a plain
 * object's string keys iterate in insertion order, so deleting a key before
 * re-inserting it moves it to the end — the same "touch" a real LRU does on
 * read or write, without carrying a parallel `order: string[]`.
 */
export const PROJECT_VIEW_LRU_CAP = 20;

/** Insert-or-update `projectId`, marking it most-recently-used, then evict
 *  the oldest entries past `cap`. */
export function touchProjectView<T>(
  map: Readonly<Record<string, T>>,
  projectId: string,
  value: T,
  cap: number = PROJECT_VIEW_LRU_CAP,
): Record<string, T> {
  const { [projectId]: _dropped, ...rest } = map;
  const next: Record<string, T> = { ...rest, [projectId]: value };

  const keys = Object.keys(next);
  if (keys.length <= cap) return next;

  const evicted = new Set(keys.slice(0, keys.length - cap));
  const result: Record<string, T> = {};
  for (const key of keys) {
    if (!evicted.has(key)) result[key] = next[key] as T;
  }
  return result;
}
