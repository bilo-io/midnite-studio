import type { KeyValueRow } from '@midnite/studio-shared';

/**
 * The URL ↔ params sync helpers (Phase 66 Theme D). Pure functions, no
 * store — `request-builder.tsx`'s URL field calls {@link parseQueryString}
 * on blur, `params-tab.tsx` calls {@link rewriteUrlParams} on every table
 * edit. Also reused by `body-tab.tsx` for the `urlencoded` body mode, which
 * is the exact same wire shape.
 */

/** `url` split at its first `?` — `query` is `undefined` for a URL with none, distinct from
 *  an empty string (`https://x/?` has one, empty). */
export function splitUrl(url: string): { base: string; query: string | undefined } {
  const index = url.indexOf('?');
  if (index === -1) return { base: url, query: undefined };
  return { base: url.slice(0, index), query: url.slice(index + 1) };
}

function decodeComponent(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '));
  } catch {
    return part;
  }
}

/**
 * A raw query string → ordered rows, every one `enabled: true` — a query
 * string carries no disabled tier of its own, so every pair present in it is,
 * definitionally, live. Row order is preserved so a rewrite round-trips.
 */
export function parseQueryString(query: string | undefined): KeyValueRow[] {
  if (!query) return [];
  return query
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      return { key: decodeComponent(key), value: decodeComponent(value), enabled: true };
    });
}

/**
 * Rows → a query string, in row order, honouring `enabled` — a disabled row
 * is left out of the string entirely (Postman's own behaviour, and the phase
 * doc's rule). Rows with no key are skipped too; an empty key never
 * round-trips through a URL anyway.
 */
export function buildQueryString(rows: readonly KeyValueRow[]): string {
  return rows
    .filter((row) => row.enabled && row.key.length > 0)
    .map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`)
    .join('&');
}

/**
 * Rewrites `url`'s query string from `rows` — the table-edit direction of the
 * sync rule. `rows` itself (disabled rows included) is what the caller
 * persists to `draft.params`; this only ever returns the URL string.
 */
export function rewriteUrlParams(url: string, rows: readonly KeyValueRow[]): string {
  const { base } = splitUrl(url);
  const query = buildQueryString(rows);
  return query.length > 0 ? `${base}?${query}` : base;
}
