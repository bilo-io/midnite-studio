import { useState } from 'react';

import { BODY_MODES, type BodyMode } from '@midnite/studio-shared';
import type { editor as MonacoEditorNS } from 'monaco-editor';

import { useApiClientStore } from '../../store/api-client-store';
import { FormDataTable, KeyValueTable, type FormDataRow } from './key-value-table';
import { MonacoField } from './monaco-field';
import { buildQueryString, parseQueryString } from './query-string';

const BODY_LABELS: Record<BodyMode, string> = {
  none: 'None',
  json: 'JSON',
  'form-data': 'Form Data',
  urlencoded: 'URL Encoded',
  raw: 'Raw',
  binary: 'Binary',
  graphql: 'GraphQL',
  xml: 'XML',
};

/** The Monaco language id per body mode — `none`/`form-data`/`urlencoded`/
 *  `binary` never reach a `MonacoField`, so they carry no entry. */
const MONACO_LANGUAGE: Partial<Record<BodyMode, string>> = {
  json: 'json',
  raw: 'plaintext',
  xml: 'xml',
  graphql: 'graphql',
};

/** Modes whose content is a real editor buffer — the rest render their own thing. */
const EDITOR_MODES: readonly BodyMode[] = ['json', 'raw', 'xml', 'graphql'];

/** `bodies['form-data']`'s own serialisation — a JSON array of {@link FormDataRow}s
 *  rather than the mode's wire bytes: unlike `urlencoded` (below), a real
 *  multipart body needs a boundary and binary streaming that the send engine
 *  (`send.ts`, Theme E, already shipped) does not build, so there is no
 *  wire-correct string this tab could store instead. Parse failures — an
 *  empty string on a fresh draft, or a hand-edited file — fall back to no
 *  rows rather than throwing. */
function isFormDataRow(row: unknown): row is FormDataRow {
  if (typeof row !== 'object' || row === null) return false;
  const candidate = row as Partial<FormDataRow>;
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.value === 'string' &&
    typeof candidate.enabled === 'boolean' &&
    (candidate.type === 'text' || candidate.type === 'file')
  );
}

function parseFormDataRows(raw: string): FormDataRow[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isFormDataRow) : [];
  } catch {
    return [];
  }
}

/**
 * The Body tab (Phase 66 Theme D) — one editor per `BodyMode`, all backed by
 * `draft.bodies[mode]` so switching modes never loses another mode's content
 * (the `Record<BodyMode, string>` contract `ApiRequestDraft` already carries).
 *
 * `json`/`raw`/`xml`/`graphql` share one `MonacoField`; `form-data`/
 * `urlencoded` share the key/value tables; `binary` is its own file-picker
 * field; `none` is a static line. Beautify (`json`/`xml` only) runs Monaco's
 * own `editor.action.formatDocument`, hidden rather than failing silently
 * when `getAction` comes back null for the current language.
 */
export function BodyTab({ tabId }: { tabId: string }) {
  const tab = useApiClientStore((s) => s.tabs.find((t) => t.id === tabId));
  const editDraft = useApiClientStore((s) => s.editDraft);
  const pickBinaryFile = useApiClientStore((s) => s.pickBinaryFile);
  const [editorInstance, setEditorInstance] = useState<MonacoEditorNS.IStandaloneCodeEditor | null>(null);

  if (!tab) return null;
  const { draft } = tab;
  const mode = draft.bodyMode;

  const setBody = (value: string) => editDraft(tabId, { bodies: { ...draft.bodies, [mode]: value } });

  const canFormat =
    (mode === 'json' || mode === 'xml') &&
    Boolean(editorInstance?.getAction('editor.action.formatDocument'));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-2">
        <select
          aria-label="Body mode"
          value={mode}
          onChange={(event) => editDraft(tabId, { bodyMode: event.target.value as BodyMode })}
          className="h-6 rounded border border-border bg-background px-1 text-[11px]"
        >
          {BODY_MODES.map((option) => (
            <option key={option} value={option}>
              {BODY_LABELS[option]}
            </option>
          ))}
        </select>
        {canFormat ? (
          <button
            type="button"
            onClick={() => editorInstance?.getAction('editor.action.formatDocument')?.run()}
            className="ml-auto rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent"
          >
            Beautify
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {mode === 'none' ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
            This request does not send a body.
          </div>
        ) : null}

        {EDITOR_MODES.includes(mode) ? (
          <MonacoField
            value={draft.bodies[mode] ?? ''}
            onChange={setBody}
            language={MONACO_LANGUAGE[mode] ?? 'plaintext'}
            onEditorMount={setEditorInstance}
          />
        ) : null}

        {mode === 'urlencoded' ? (
          <KeyValueTable
            rows={parseQueryString(draft.bodies.urlencoded)}
            addLabel="Add field"
            onChange={(rows) => setBody(buildQueryString(rows))}
          />
        ) : null}

        {mode === 'form-data' ? (
          <FormDataTable
            rows={parseFormDataRows(draft.bodies['form-data'] ?? '')}
            onChange={(rows) => setBody(JSON.stringify(rows))}
            onPickFile={() => pickBinaryFile()}
          />
        ) : null}

        {mode === 'binary' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="max-w-sm truncate text-xs text-muted-foreground">
              {draft.binaryPath ?? 'No file selected.'}
            </p>
            <button
              type="button"
              onClick={() =>
                void pickBinaryFile().then((path) => {
                  if (path) editDraft(tabId, { binaryPath: path });
                })
              }
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              Choose File…
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
