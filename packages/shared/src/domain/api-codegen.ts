import type { ApiRequestDraft, KeyValueRow } from './api-client';

/**
 * Phase 70 Theme D — one-way code generation from the renderer's editable
 * request draft to a shell `curl` invocation or a JS `fetch` snippet.
 *
 * Pure and dependency-free on purpose: `shared` may import nothing but zod
 * (CLAUDE.md's package boundaries), which is exactly what lets both
 * processes call this and bare vitest test it with no DOM and no Electron
 * main process — see `api-client.ts`'s own header for the same reasoning
 * about `toDraft`/`toPostmanRequest`.
 *
 * **`{{var}}` tokens are never resolved here, and that is the whole point of
 * the theme (phase doc Decision 7).** The most common destination for a
 * copied curl or fetch snippet is a chat message, and resolving a token
 * would risk pasting a live bearer token straight into it — reaching for
 * `interpolate.ts` here (main-only, and `shared` cannot import it anyway)
 * would be exactly the wrong convenience. Both generators read `draft`
 * verbatim and prepend a one-line comment saying so, rather than silently
 * leaving the reader to notice.
 */

const CURL_NOTE =
  '# {{var}} placeholders are left unresolved on purpose (Midnite Studio) — resolving them here could paste a secret into wherever you paste this.';
const FETCH_NOTE =
  '// {{var}} placeholders are left unresolved on purpose (Midnite Studio) — resolving them here could paste a secret into wherever you paste this.';

/**
 * Shell-quote one argument for `sh`/`bash`: wrap in single quotes, and for
 * every embedded single quote, close the quoting, emit an escaped quote, and
 * reopen it (`'` → `'"'"'`) — the one way `sh` lets a literal `'` appear
 * inside a single-quoted string. A space needs no separate handling: the
 * surrounding quotes already protect it.
 */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** A JS string literal for `value` — `JSON.stringify` rather than hand-rolled
 *  escaping, so a quote, a backslash or a newline in a header/body value
 *  round-trips as valid JS without a second escaping pass. `{{var}}` survives
 *  verbatim: `{` and `}` need no escaping in a JS string. */
function jsString(value: string): string {
  return JSON.stringify(value);
}

/** Rows worth emitting: enabled, and carrying a non-empty key. A disabled
 *  header/param row is dropped outright, never emitted commented-out. */
function liveRows(rows: readonly KeyValueRow[]): KeyValueRow[] {
  return rows.filter((row) => row.enabled && row.key.length > 0);
}

/** `bodies['form-data']`'s own shape (`body-tab.tsx`'s `FormDataRow`),
 *  duplicated here in miniature rather than imported — `shared` cannot
 *  depend on `packages/app`, and this is the one place outside it that needs
 *  to read the same JSON-array serialisation back out. */
type FormDataRowLike = { key: string; value: string; enabled: boolean; type: 'text' | 'file' };

function isFormDataRow(row: unknown): row is FormDataRowLike {
  if (typeof row !== 'object' || row === null) return false;
  const candidate = row as Partial<FormDataRowLike>;
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.value === 'string' &&
    typeof candidate.enabled === 'boolean' &&
    (candidate.type === 'text' || candidate.type === 'file')
  );
}

/** An unparsable or non-array string yields no rows rather than throwing —
 *  exactly as `body-tab.tsx`'s own `parseFormDataRows` treats a fresh or
 *  hand-edited draft. */
function parseFormDataRows(raw: string): FormDataRowLike[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isFormDataRow) : [];
  } catch {
    return [];
  }
}

/**
 * The URL a codegen'd snippet actually targets: `draft.url` as edited, plus
 * an `apikey`-in-query auth's own param. That one case is the only auth
 * field Theme D's UI applies solely at send time (`send.ts`'s
 * `target.searchParams.set`) rather than keeping mirrored into
 * `draft.url`/`draft.params` the way the Params tab keeps the two in sync
 * for everything else — so codegen has to add it back in, here, once.
 * Never percent-encoded: `encodeURIComponent` would mangle a literal
 * `{{var}}` into `%7B%7Bvar%7D%7D`, which is exactly the unresolved-token
 * literal this module exists to preserve.
 */
function resolvedUrl(draft: ApiRequestDraft): string {
  if (draft.auth.type === 'apikey' && draft.auth.in === 'query' && draft.auth.key.length > 0) {
    const separator = draft.url.includes('?') ? '&' : '?';
    return `${draft.url}${separator}${draft.auth.key}=${draft.auth.value}`;
  }
  return draft.url;
}

/**
 * Every header this request sends, as plain `[key, value]` pairs, in order:
 * the Headers tab's own enabled rows, then whatever `draft.auth` implies —
 * mirroring `send.ts`'s `applyAuth`. `basic` is deliberately left out here:
 * a curl invocation and a fetch snippet express it differently (`--user` vs
 * a computed `Authorization` header), so each generator adds its own.
 */
function commonHeaderRows(draft: ApiRequestDraft): [string, string][] {
  const rows: [string, string][] = liveRows(draft.headers).map((row) => [row.key, row.value]);
  if (draft.auth.type === 'bearer' && draft.auth.token.length > 0) {
    rows.push(['Authorization', `Bearer ${draft.auth.token}`]);
  }
  if (draft.auth.type === 'apikey' && draft.auth.in === 'header' && draft.auth.key.length > 0) {
    rows.push([draft.auth.key, draft.auth.value]);
  }
  return rows;
}

type BodyPlan =
  | { kind: 'none' }
  | { kind: 'raw'; text: string }
  | { kind: 'form'; rows: FormDataRowLike[] }
  | { kind: 'binary'; path: string };

/** What `draft` actually sends as a body — mirrors `send.ts`'s own
 *  `buildBody` gate (no body for GET/HEAD or `bodyMode: 'none'`), plus the
 *  two modes that need their own on-disk shape parsed back out. */
function bodyPlan(draft: ApiRequestDraft): BodyPlan {
  const method = draft.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || draft.bodyMode === 'none') return { kind: 'none' };

  if (draft.bodyMode === 'form-data') {
    const rows = parseFormDataRows(draft.bodies['form-data'] ?? '').filter((row) => row.enabled);
    return rows.length > 0 ? { kind: 'form', rows } : { kind: 'none' };
  }

  if (draft.bodyMode === 'binary') {
    return draft.binaryPath ? { kind: 'binary', path: draft.binaryPath } : { kind: 'none' };
  }

  const text = draft.bodies[draft.bodyMode] ?? '';
  return text.length > 0 ? { kind: 'raw', text } : { kind: 'none' };
}

/**
 * `draft` → a shell-quoted `curl` invocation, one flag per line for
 * readability, `{{var}}` tokens surviving verbatim. `basic` auth is
 * expressed as curl's own `--user 'user:pass'` rather than pre-encoded to
 * base64: an unresolved `{{username}}`/`{{password}}` stays legible instead
 * of vanishing into a token nobody can read back out.
 */
export function toCurl(draft: ApiRequestDraft): string {
  const method = draft.method.toUpperCase();
  const lines = [CURL_NOTE, `curl --request ${method} \\`, `  --url ${shQuote(resolvedUrl(draft))}`];

  const appendFlag = (flag: string): void => {
    lines[lines.length - 1] = `${lines[lines.length - 1]} \\`;
    lines.push(`  ${flag}`);
  };

  for (const [key, value] of commonHeaderRows(draft)) {
    appendFlag(`--header ${shQuote(`${key}: ${value}`)}`);
  }

  if (draft.auth.type === 'basic' && (draft.auth.username.length > 0 || draft.auth.password.length > 0)) {
    appendFlag(`--user ${shQuote(`${draft.auth.username}:${draft.auth.password}`)}`);
  }

  const plan = bodyPlan(draft);
  if (plan.kind === 'raw') {
    appendFlag(`--data-raw ${shQuote(plan.text)}`);
  } else if (plan.kind === 'binary') {
    appendFlag(`--data-binary @${shQuote(plan.path)}`);
  } else if (plan.kind === 'form') {
    for (const row of plan.rows) {
      const fieldValue = row.type === 'file' ? `@${row.value}` : row.value;
      appendFlag(`-F ${shQuote(`${row.key}=${fieldValue}`)}`);
    }
  }

  return lines.join('\n');
}

/**
 * `draft` → a JS `fetch(url, {method, headers, body})` snippet, `{{var}}`
 * tokens surviving verbatim. `basic` auth becomes a computed `Authorization`
 * header using `btoa` (the browser global a pasted-into-devtools snippet
 * actually has, unlike `Buffer`); a `form-data` body becomes a `FormData`
 * builder ahead of the `fetch` call rather than a body literal, since that is
 * the one shape `fetch` itself expects for it.
 */
export function toFetch(draft: ApiRequestDraft): string {
  const method = draft.method.toUpperCase();
  const url = resolvedUrl(draft);

  const headerLines: string[] = commonHeaderRows(draft).map(
    ([key, value]) => `    ${jsString(key)}: ${jsString(value)},`,
  );
  if (draft.auth.type === 'basic' && (draft.auth.username.length > 0 || draft.auth.password.length > 0)) {
    const credentials = jsString(`${draft.auth.username}:${draft.auth.password}`);
    headerLines.push(`    ${jsString('Authorization')}: \`Basic \${btoa(${credentials})}\`,`);
  }

  const preLines: string[] = [];
  const bodyLines: string[] = [];
  const plan = bodyPlan(draft);
  if (plan.kind === 'raw') {
    bodyLines.push(`  body: ${jsString(plan.text)},`);
  } else if (plan.kind === 'binary') {
    bodyLines.push(
      `  body: undefined, // binary file "${plan.path}" — read it and pass its bytes/stream here`,
    );
  } else if (plan.kind === 'form') {
    preLines.push('const formData = new FormData();');
    for (const row of plan.rows) {
      preLines.push(
        row.type === 'file'
          ? `formData.append(${jsString(row.key)}, /* file */ ${jsString(row.value)});`
          : `formData.append(${jsString(row.key)}, ${jsString(row.value)});`,
      );
    }
    bodyLines.push('  body: formData,');
  }

  const lines = [FETCH_NOTE, ...preLines, `fetch(${jsString(url)}, {`, `  method: ${jsString(method)},`];
  if (headerLines.length > 0) {
    lines.push('  headers: {', ...headerLines, '  },');
  }
  lines.push(...bodyLines, '});');
  return lines.join('\n');
}
