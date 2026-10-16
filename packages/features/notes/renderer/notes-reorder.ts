/**
 * Splice a drag result over the *filtered* list back into the full order.
 *
 * With "Hide completed" on, the list the user drags is a subsequence of the
 * repository's notes, so `SortableList` hands back only the visible ids. This
 * walks the full order and consumes one id from `nextVisibleIds` at each slot
 * a visible note occupied, leaving every hidden note pinned to the index it
 * already had: the filter is a lens, and turning it off must not reveal notes
 * that shuffled while they were out of sight.
 *
 * Pure, and exported for its own test, because the alternative is asserting it
 * through a dnd-kit pointer gesture in jsdom — which measures nothing and so
 * can only ever confirm the parts that are not this.
 */
export function spliceVisibleOrder(
  fullIds: string[],
  visibleIds: string[],
  nextVisibleIds: string[],
): string[] {
  const visible = new Set(visibleIds);
  let cursor = 0;
  return fullIds.map((id) => (visible.has(id) ? (nextVisibleIds[cursor++] ?? id) : id));
}
