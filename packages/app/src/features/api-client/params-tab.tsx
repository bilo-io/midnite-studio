import { useApiClientStore } from '../../store/api-client-store';
import { computedParams } from './computed-fields';
import { KeyValueTable } from './key-value-table';
import { rewriteUrlParams } from './query-string';

/**
 * The Params tab (Phase 66 Theme D) — a `KeyValueTable` bidirectionally
 * synced with the URL's query string.
 *
 * This is the table-edit direction of the sync rule: any edit here rewrites
 * `draft.url`'s query string in row order, via {@link rewriteUrlParams},
 * which drops a disabled row from the string while `draft.params` itself
 * (the table) keeps it. The other direction — the URL is authoritative on
 * blur of the URL input — lives in `request-builder.tsx`, next to the field
 * that fires it.
 */
export function ParamsTab({ tabId }: { tabId: string }) {
  const tab = useApiClientStore((s) => s.tabs.find((t) => t.id === tabId));
  const editDraft = useApiClientStore((s) => s.editDraft);
  if (!tab) return null;

  return (
    <KeyValueTable
      rows={tab.draft.params}
      computedRows={computedParams(tab.draft)}
      addLabel="Add param"
      onChange={(rows) => editDraft(tabId, { params: rows, url: rewriteUrlParams(tab.draft.url, rows) })}
    />
  );
}
