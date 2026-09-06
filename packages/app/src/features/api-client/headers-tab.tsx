import { useApiClientStore } from '../../store/api-client-store';
import { computedHeaders } from './computed-fields';
import { KeyValueTable } from './key-value-table';

/**
 * The Headers tab (Phase 66 Theme D) — the same `KeyValueTable` Params uses,
 * plus the computed `Host`/`Content-Length`/`Content-Type`/`Authorization`
 * rows from `computed-fields.ts`, rendered greyed and non-editable above the
 * user's own rows.
 */
export function HeadersTab({ tabId }: { tabId: string }) {
  const tab = useApiClientStore((s) => s.tabs.find((t) => t.id === tabId));
  const editDraft = useApiClientStore((s) => s.editDraft);
  if (!tab) return null;

  return (
    <KeyValueTable
      rows={tab.draft.headers}
      computedRows={computedHeaders(tab.draft)}
      addLabel="Add header"
      onChange={(rows) => editDraft(tabId, { headers: rows })}
    />
  );
}
