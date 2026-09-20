/**
 * Bounding `cardSkillByTask` (Phase 92 Theme C) the same way
 * `project-view-lru.ts`'s `touchProjectView` bounds `projectViewByProject` —
 * a user who assigns a skill to many cards over time should not accumulate
 * an unbounded map any more than one who opens many projects should.
 *
 * A separate module rather than a shared import: `project-view-lru.ts` lives
 * under `features/projects/` (not `board/`) and this map is board-specific,
 * so mirroring its generic, dependency-free shape here — same insertion-
 * order-of-a-plain-object trick, same eviction order — keeps this file
 * importable from `ui-store.ts` with nothing else in `features/projects`
 * pulled in behind it.
 */
export const CARD_SKILL_LRU_CAP = 200;

/** Insert-or-update `taskKey`, marking it most-recently-used, then evict
 *  the oldest entries past `cap`. */
export function touchCardSkill<T>(
  map: Readonly<Record<string, T>>,
  taskKey: string,
  value: T,
  cap: number = CARD_SKILL_LRU_CAP,
): Record<string, T> {
  const { [taskKey]: _dropped, ...rest } = map;
  const next: Record<string, T> = { ...rest, [taskKey]: value };

  const keys = Object.keys(next);
  if (keys.length <= cap) return next;

  const evicted = new Set(keys.slice(0, keys.length - cap));
  const result: Record<string, T> = {};
  for (const key of keys) {
    if (!evicted.has(key)) result[key] = next[key] as T;
  }
  return result;
}
