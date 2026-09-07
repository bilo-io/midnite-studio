import { useState } from 'react';

import { toCurl, toFetch } from '@midnite/studio-shared';
import { LuCopy, LuEllipsisVertical, LuLoaderCircle, LuSend } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { IconButton } from '../../components/icon-button';
import { ResizeHandle } from '../../components/resizable/resize-handle';
import { useResizable } from '../../components/resizable/use-resizable';
import { bridge } from '../../services/bridge';
import { useApiClientStore } from '../../store/api-client-store';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { AuthTab } from './auth-tab';
import { BodyTab } from './body-tab';
import { HeadersTab } from './headers-tab';
import { ParamsTab } from './params-tab';
import { ResponseViewer } from './response-viewer';
import { parseQueryString, splitUrl } from './query-string';
import { scriptCountBadge, TestEditor } from './test-editor';
import { TestResultsPanel } from './test-results-panel';
import { UrlField } from './url-field';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

type BuilderTab = 'params' | 'headers' | 'auth' | 'body' | 'scripts';
const BUILDER_TABS: { id: BuilderTab; label: string }[] = [
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'auth', label: 'Auth' },
  { id: 'body', label: 'Body' },
  { id: 'scripts', label: 'Scripts' },
];

/**
 * The full request builder (Phase 66 Theme D) — replaces `request-bar.tsx`
 * wholesale (Decision 2's stopgap). Method dropdown + `{{var}}`-highlighted
 * URL bar, above a four-tab row (Params · Headers · Auth · Body), above the
 * tab's own body, with `ResponseViewer` below a horizontal `ResizeHandle`.
 *
 * The method control is a `<select>` with the seven verbs the phase doc
 * names, but it is not restricted to them at the type level — an imported
 * request with an unusual verb (`ApiRequestDraft.method` is a bare string)
 * still round-trips: selecting a listed verb overwrites it same as any edit,
 * but nothing here coerces an odd verb to GET on open.
 *
 * The URL ↔ params sync rule (phase doc, Theme D): **the URL is
 * authoritative on blur of the URL input** — `onUrlBlur` below re-parses the
 * current query string into `draft.params`, discarding whatever the table
 * held that the URL text does not — **the table is authoritative on any
 * table edit**, which `params-tab.tsx` implements by rewriting the URL on
 * every change instead.
 */
export function RequestBuilder({ tabId }: { tabId: string }) {
  const dialogs = useDialogs();
  const tab = useApiClientStore((s) => s.tabs.find((t) => t.id === tabId));
  const editDraft = useApiClientStore((s) => s.editDraft);
  const sendRequest = useApiClientStore((s) => s.sendRequest);
  const cancelRequest = useApiClientStore((s) => s.cancelRequest);
  const inFlight = useApiClientStore((s) => Boolean(s.inFlight[tabId]));
  const collection = useApiClientStore((s) => s.collections.find((c) => c.id === tab?.collectionId));

  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const builder = useResizable({
    size: layout.apiBuilderHeight,
    onSize: (value) => setLayout('apiBuilderHeight', value),
    initial: DEFAULT_LAYOUT.apiBuilderHeight,
    axis: 'y',
    ...LAYOUT_BOUNDS.apiBuilderHeight,
  });

  const [activeTab, setActiveTab] = useState<BuilderTab>('params');

  if (!tab) return null;
  const { draft } = tab;

  const knownMethod = (METHODS as readonly string[]).includes(draft.method.toUpperCase());
  const variableNames = new Set((collection?.collection.variable ?? []).map((variable) => variable.key));

  /**
   * Phase 70 Theme D's "Copy as curl" / "Copy as fetch" — generated from the
   * draft as it stands right now, `{{var}}` left unresolved on purpose
   * (Decision 7): the usual destination for a copied snippet is a chat
   * message, and resolving a token would risk pasting a live secret straight
   * into it.
   */
  const copyAs = (generator: 'curl' | 'fetch') => {
    const text = generator === 'curl' ? toCurl(draft) : toFetch(draft);
    void bridge()?.clipboard.writeText({ text });
  };

  const overflowMenu = [
    { label: 'Copy as curl', icon: LuCopy, onSelect: () => copyAs('curl') },
    { label: 'Copy as fetch', icon: LuCopy, onSelect: () => copyAs('fetch') },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div style={{ height: builder.current }} className="flex min-h-0 shrink-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
          <select
            aria-label="Method"
            value={knownMethod ? draft.method.toUpperCase() : draft.method}
            onChange={(event) => editDraft(tabId, { method: event.target.value })}
            className="h-7 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs font-semibold"
          >
            {!knownMethod ? <option value={draft.method}>{draft.method}</option> : null}
            {METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
          <UrlField
            value={draft.url}
            onChange={(url) => editDraft(tabId, { url })}
            onBlur={() => editDraft(tabId, { params: parseQueryString(splitUrl(draft.url).query) })}
            variableNames={variableNames}
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
              disabled={draft.url.trim().length === 0}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs transition-colors disabled:opacity-50"
            >
              <LuSend className="h-3 w-3" aria-hidden />
              Send
            </button>
          )}
          <IconButton
            icon={LuEllipsisVertical}
            label="More actions"
            onClick={(event) => dialogs.openMenu(event, overflowMenu)}
          />
        </div>

        <div className="flex h-7 shrink-0 items-center gap-3 border-b border-border px-2 text-xs">
          {BUILDER_TABS.map((builderTab) => {
            const badge = builderTab.id === 'scripts' ? scriptCountBadge(draft) : 0;
            return (
              <button
                key={builderTab.id}
                type="button"
                onClick={() => setActiveTab(builderTab.id)}
                aria-pressed={activeTab === builderTab.id}
                className={`flex items-center gap-1 ${
                  activeTab === builderTab.id ? 'font-medium text-foreground' : 'text-muted-foreground'
                }`}
              >
                {builderTab.label}
                {badge > 0 ? (
                  <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {activeTab === 'params' ? <ParamsTab tabId={tabId} /> : null}
          {activeTab === 'headers' ? <HeadersTab tabId={tabId} /> : null}
          {activeTab === 'auth' ? <AuthTab tabId={tabId} /> : null}
          {activeTab === 'body' ? <BodyTab tabId={tabId} /> : null}
          {activeTab === 'scripts' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <TestEditor tabId={tabId} />
              <TestResultsPanel tabId={tabId} />
            </div>
          ) : null}
        </div>
      </div>

      <ResizeHandle resizable={builder} axis="y" label="Resize the request builder" />

      <ResponseViewer tabId={tabId} />
    </div>
  );
}
