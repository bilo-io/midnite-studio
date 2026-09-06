import type { ApiRequestDraft, BodyMode } from '@midnite/studio-shared';

/**
 * The "Auto-generated" rows the Headers and Params tabs render greyed and
 * non-editable above the user's own rows (Phase 66 Theme D) — computed from
 * the rest of the draft, never written into `draft.headers`/`draft.params`.
 */
export type ComputedField = { key: string; value: string };

/**
 * The implicit `content-type` a body mode carries. A duplicate of
 * `send.ts`'s own `contentTypeFor`, deliberately: `packages/app` cannot
 * import `packages/desktop`'s main-process module graph (package
 * boundaries), so this is the price of a Headers-tab preview that has to
 * agree with what actually gets sent.
 */
export function contentTypeForBodyMode(mode: BodyMode): string | null {
  switch (mode) {
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'graphql':
      return 'application/json';
    case 'urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'form-data':
      return 'multipart/form-data';
    default:
      return null;
  }
}

/** Best-effort host extraction — a real `new URL(...)` parse first, falling
 *  back to a scheme-relative regex for a `{{var}}`-templated or otherwise
 *  unparseable URL, which is normal here (a draft is edited mid-typing). */
function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.host || null;
  } catch {
    const match = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\/([^/?#]+)/.exec(url);
    return match?.[1] ?? null;
  }
}

/** UTF-8 byte length, without pulling in a Buffer polyfill for the renderer. */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** `btoa` requires a byte string; this is the standard escape-hatch for a
 *  possibly non-Latin1 value, matching what `send.ts`'s `Buffer.from(...,
 *  'utf8').toString('base64')` produces for the same input. */
function toBase64(value: string): string {
  try {
    return btoa(unescape(encodeURIComponent(value)));
  } catch {
    return '';
  }
}

/**
 * The Headers tab's computed rows: `Host`, `Content-Length` and
 * `Content-Type` (only when the body mode implies one) plus whatever the
 * Auth tab contributes as a header — `Authorization` for `bearer`/`basic`,
 * or the named header for an `apikey` in `'header'` mode. None of this is
 * written to `draft.headers`; it exists only to answer "why did my
 * Content-Type change".
 */
export function computedHeaders(draft: ApiRequestDraft): ComputedField[] {
  const fields: ComputedField[] = [];

  const host = hostOf(draft.url);
  if (host) fields.push({ key: 'Host', value: host });

  const method = draft.method.toUpperCase();
  const bodyIsSent = method !== 'GET' && method !== 'HEAD' && draft.bodyMode !== 'none';
  if (bodyIsSent) {
    if (draft.bodyMode === 'binary') {
      if (draft.binaryPath) {
        fields.push({ key: 'Content-Type', value: 'application/octet-stream' });
      }
    } else {
      const body = draft.bodies[draft.bodyMode] ?? '';
      fields.push({ key: 'Content-Length', value: String(byteLength(body)) });
      const contentType = contentTypeForBodyMode(draft.bodyMode);
      if (contentType) fields.push({ key: 'Content-Type', value: contentType });
    }
  }

  const auth = draft.auth;
  if (auth.type === 'bearer' && auth.token) {
    fields.push({ key: 'Authorization', value: `Bearer ${auth.token}` });
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    fields.push({ key: 'Authorization', value: `Basic ${toBase64(`${auth.username}:${auth.password}`)}` });
  } else if (auth.type === 'apikey' && auth.in === 'header' && auth.key) {
    fields.push({ key: auth.key, value: auth.value });
  }

  return fields;
}

/**
 * The Params tab's computed rows: the query-param contribution an `apikey` /
 * `in: 'query'` auth makes. Never written into `draft.params` or
 * `draft.url` — Theme E's send engine adds it directly to the outgoing URL
 * at send time (`applyAuth` in `send.ts`), so this preview and the real
 * request agree without this tab owning any of that state.
 */
export function computedParams(draft: ApiRequestDraft): ComputedField[] {
  if (draft.auth.type === 'apikey' && draft.auth.in === 'query' && draft.auth.key) {
    return [{ key: draft.auth.key, value: draft.auth.value }];
  }
  return [];
}
