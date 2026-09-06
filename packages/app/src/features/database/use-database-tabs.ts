import { useWorkbenchStore } from '../../store/workbench-store';

/**
 * Open (or refocus) a query tab. `tabId()` derives identity from
 * `connectionId` + `label` (`workbench-store.ts`), so callers control
 * dedup-vs-always-new purely through the label they pass:
 *
 * - A blank "new query tab" passes a fresh, numbered label (`Query 1`, `Query
 *   2`, …) so it always creates a new tab, never refocuses an old one.
 * - "Preview data" passes the table's own name as the label, so clicking it
 *   again on the same table refocuses that same preview rather than
 *   stacking duplicates.
 */
export function openQueryTab(input: { connectionId: string; label: string; sql?: string }): void {
  useWorkbenchStore.getState().openTab({
    kind: 'query',
    connectionId: input.connectionId,
    label: input.label,
    sql: input.sql ?? '',
  });
}

/** The next free "Query N" label for a connection — never collides with an open tab. */
export function nextQueryLabel(connectionId: string): string {
  const openLabels = new Set(
    useWorkbenchStore
      .getState()
      .tabs.filter((tab) => tab.kind === 'query' && tab.connectionId === connectionId)
      .map((tab) => tab.label),
  );
  let n = 1;
  while (openLabels.has(`Query ${n}`)) n += 1;
  return `Query ${n}`;
}
