import { LuLoaderCircle, LuSend } from 'react-icons/lu';

import { useApiClientStore } from '../../store/api-client-store';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/**
 * A minimal inline method + URL bar (Phase 66 Theme C, Decision 2) — the
 * whole request builder this phase ships. Theme D's full
 * `RequestBuilder` (params/headers/auth/body tabs on Monaco) is not being
 * built now and will replace this wholesale; this exists only so a request
 * can actually be sent and its response rendered.
 *
 * The method control is a `<select>` with the seven verbs the phase doc
 * names, but it is not restricted to them at the type level — an imported
 * request with an unusual verb (`ApiRequestDraft.method` is a bare string)
 * still round-trips: selecting a listed verb overwrites it same as any
 * edit, but nothing here coerces an odd verb to GET on open.
 */
export function RequestBar({ tabId }: { tabId: string }) {
  const tab = useApiClientStore((s) => s.tabs.find((t) => t.id === tabId));
  const editDraft = useApiClientStore((s) => s.editDraft);
  const sendRequest = useApiClientStore((s) => s.sendRequest);
  const cancelRequest = useApiClientStore((s) => s.cancelRequest);
  const inFlight = useApiClientStore((s) => Boolean(s.inFlight[tabId]));

  if (!tab) return null;

  const knownMethod = (METHODS as readonly string[]).includes(tab.draft.method.toUpperCase());

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
      <select
        aria-label="Method"
        value={knownMethod ? tab.draft.method.toUpperCase() : tab.draft.method}
        onChange={(event) => editDraft(tabId, { method: event.target.value })}
        className="h-7 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs font-semibold"
      >
        {!knownMethod ? <option value={tab.draft.method}>{tab.draft.method}</option> : null}
        {METHODS.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>
      <input
        aria-label="URL"
        type="text"
        value={tab.draft.url}
        onChange={(event) => editDraft(tabId, { url: event.target.value })}
        placeholder="https://api.example.com/{{path}}"
        className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs"
      />
      {inFlight ? (
        <button
          type="button"
          onClick={() => cancelRequest(tabId)}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <LuLoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void sendRequest(tabId)}
          disabled={tab.draft.url.trim().length === 0}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs transition-colors disabled:opacity-50"
        >
          <LuSend className="h-3 w-3" aria-hidden />
          Send
        </button>
      )}
    </div>
  );
}
