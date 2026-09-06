import { useEffect, useState } from 'react';

import { COUNCIL_OUTPUT_CAP_BYTES, type ApiResponse } from '@midnite/studio-shared';
import { LuLoaderCircle } from 'react-icons/lu';

import { LoadingRegion, Skeleton } from '../../components/skeleton';
import { formatBytes } from '../monitor/format-bytes';
import { useApiClientStore } from '../../store/api-client-store';
import { MonacoField } from './monaco-field';
import { StatusPill } from './status-pill';

type BodyKind = 'json' | 'xml' | 'html' | 'text' | 'image' | 'unsupported';

/**
 * The body's own renderer, from `contentType` (Phase 66 Theme F). JSON and
 * XML/HTML get a real editor; a handful of opaque prefixes (media, fonts,
 * an octet-stream, a PDF, a zip) fall to the "no preview" card; everything
 * else — `text/*`, an unset content-type, an unrecognised `application/*` —
 * renders as plain text rather than being refused, the same way a real
 * server's odd content-type still shows *something* in Postman.
 */
function classifyBody(contentType: string | null, bodyIsJson: boolean): BodyKind {
  const ct = (contentType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  if (bodyIsJson || ct.includes('json')) return 'json';
  if (ct === 'text/html' || ct.endsWith('+html')) return 'html';
  if (ct.includes('xml')) return 'xml';
  if (ct.startsWith('image/')) return 'image';
  const opaquePrefixes = [
    'audio/',
    'video/',
    'font/',
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    'application/vnd.',
  ];
  if (ct && opaquePrefixes.some((prefix) => ct.startsWith(prefix))) return 'unsupported';
  return 'text';
}

/** `<img>` refuses anything over 2 MB rather than building the data: URL at all. */
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * The response pane below the request bar (Phase 66 Theme F): a status/time/
 * size strip, a Body/Headers tab pair, and the body itself.
 *
 * Reads everything from `api-client-store` by `tabId` rather than taking the
 * response as a prop — the same reason `RequestBuilder` does: Send lives in
 * one component, Retry in this one, and both have to drive the exact same
 * `sendRequest` action for a cancelled-mid-flight race to behave the same
 * way from either button.
 */
export function ResponseViewer({ tabId }: { tabId: string }) {
  const history = useApiClientStore((s) => s.responses[tabId]);
  const inFlight = useApiClientStore((s) => Boolean(s.inFlight[tabId]));
  const lastError = useApiClientStore((s) => s.lastError[tabId]);
  const sendRequest = useApiClientStore((s) => s.sendRequest);
  const cancelRequest = useApiClientStore((s) => s.cancelRequest);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pane, setPane] = useState<'body' | 'headers'>('body');
  const [showRaw, setShowRaw] = useState(false);

  const list = history ?? [];
  // A freshly landed response always jumps the picker back to "latest" —
  // otherwise a second send while looking at history #3 would land invisibly
  // behind it.
  useEffect(() => {
    setSelectedIndex(0);
  }, [list.length]);

  if (inFlight) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-end border-b border-border px-2">
          <button
            type="button"
            onClick={() => cancelRequest(tabId)}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            <LuLoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
            Cancel
          </button>
        </div>
        <LoadingRegion label="Sending request" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </LoadingRegion>
      </div>
    );
  }

  if (lastError) {
    return (
      <div className="flex min-h-0 flex-1 items-start p-4">
        <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="mb-2">{lastError}</p>
          <button
            type="button"
            onClick={() => void sendRequest(tabId)}
            className="rounded-md border border-destructive/40 px-2 py-1 font-medium transition-colors hover:bg-destructive/20"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Send the request to see a response.</p>
      </div>
    );
  }

  const response = list[selectedIndex] ?? list[0]!;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2 text-xs text-muted-foreground">
        <StatusPill status={response.status} />
        <span>{response.statusText}</span>
        <span>{response.durationMs} ms</span>
        <span>{formatBytes(response.sizeBytes)}</span>
        {list.length > 1 ? (
          <select
            aria-label="Response history"
            value={selectedIndex}
            onChange={(event) => setSelectedIndex(Number(event.target.value))}
            className="ml-auto h-6 rounded border border-border bg-background px-1 text-[11px]"
          >
            {list.map((entry, index) => (
              <option key={index} value={index}>
                {index === 0 ? 'Latest' : `${list.length - index} sends ago`} · {entry.status}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-3 border-b border-border px-2 text-xs">
        <button
          type="button"
          onClick={() => setPane('body')}
          aria-pressed={pane === 'body'}
          className={pane === 'body' ? 'font-medium text-foreground' : 'text-muted-foreground'}
        >
          Body
        </button>
        <button
          type="button"
          onClick={() => setPane('headers')}
          aria-pressed={pane === 'headers'}
          className={pane === 'headers' ? 'font-medium text-foreground' : 'text-muted-foreground'}
        >
          Headers
        </button>
      </div>

      {response.truncated ? (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          Response truncated at {formatBytes(COUNCIL_OUTPUT_CAP_BYTES)} — the rest was not read.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {pane === 'headers' ? (
          <HeadersPane headers={response.headers} />
        ) : (
          <BodyPane response={response} showRaw={showRaw} onToggleRaw={() => setShowRaw((v) => !v)} />
        )}
      </div>
    </div>
  );
}

function HeadersPane({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">No response headers.</p>;
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 py-0.5">
          <span className="shrink-0 text-muted-foreground">{key}:</span>
          <span className="min-w-0 break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}

function BodyPane({
  response,
  showRaw,
  onToggleRaw,
}: {
  response: ApiResponse;
  showRaw: boolean;
  onToggleRaw: () => void;
}) {
  const kind = classifyBody(response.contentType, response.bodyIsJson);

  if (kind === 'json') {
    let pretty: string | null = null;
    try {
      pretty = JSON.stringify(JSON.parse(response.body), null, 2);
    } catch {
      pretty = null;
    }
    if (pretty === null) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 px-2 py-1 text-[11px] text-muted-foreground">Not valid JSON</p>
          <MonacoField value={response.body} onChange={() => {}} language="plaintext" readOnly />
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 justify-end px-2 py-1">
          <button
            type="button"
            onClick={onToggleRaw}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent"
          >
            {showRaw ? 'Pretty' : 'Raw'}
          </button>
        </div>
        <MonacoField value={showRaw ? response.body : pretty} onChange={() => {}} language="json" readOnly />
      </div>
    );
  }

  if (kind === 'xml' || kind === 'html') {
    return (
      <MonacoField value={response.body} onChange={() => {}} language={kind === 'html' ? 'html' : 'xml'} readOnly />
    );
  }

  if (kind === 'image') {
    if (response.sizeBytes > MAX_INLINE_IMAGE_BYTES) {
      return (
        <NoPreview
          contentType={response.contentType}
          sizeBytes={response.sizeBytes}
          note="Too large to preview inline"
        />
      );
    }
    // `response.body` is already the base64 payload for a binary content-type
    // — Theme E's send engine (out of this phase's scope) is what encodes it
    // that way specifically so this pane never has to re-encode raw bytes
    // that already crossed IPC as a string.
    const dataUrl = `data:${response.contentType ?? 'image/*'};base64,${response.body}`;
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <img src={dataUrl} alt="Response body" className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  if (kind === 'unsupported') {
    return <NoPreview contentType={response.contentType} sizeBytes={response.sizeBytes} />;
  }

  return <MonacoField value={response.body} onChange={() => {}} language="plaintext" readOnly />;
}

function NoPreview({
  contentType,
  sizeBytes,
  note,
}: {
  contentType: string | null;
  sizeBytes: number;
  note?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        {contentType ?? 'unknown'} · {formatBytes(sizeBytes)} — no preview
      </p>
      {note ? <p className="text-xs text-muted-foreground/70">{note}</p> : null}
      <button
        type="button"
        disabled
        // Checked against PR #227's shipped surface (Themes E, G): it added
        // `apiExportCollection` — a *collection* file, opened by its own id —
        // not a channel for saving arbitrary bytes a response body carries.
        // Nothing in the current IPC contract can back this button yet.
        title="No channel exists yet to save a response body to disk"
        className="mt-1 rounded-md border border-border px-3 py-1 text-xs text-muted-foreground opacity-50"
      >
        Save response as…
      </button>
    </div>
  );
}
