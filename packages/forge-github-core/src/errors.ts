import type { ForgeProjectReadKind } from '@midnite/studio-shared';

import { asString, asArray, pick } from './json';

/** The same ceiling `describeFailure` applies in forge main, and for the same reason. */
const GRAPHQL_MESSAGE_MAX = 300;

/**
 * What went wrong, in GraphQL's own words: the first non-empty `errors[].message` of a parsed response
 * body (the object holding `data` / `errors`), capped at 300 characters. `null` when the body carries no
 * message, so a caller can fall back to its transport's own text (`gh` stderr, an HTTP status line).
 */
export function graphqlErrorMessage(payload: unknown): string | null {
  const errors = pick(payload, 'errors');
  if (!Array.isArray(errors)) return null;
  const message = errors
    .map((entry) => asString(pick(entry, 'message')))
    .find((text): text is string => text !== null && text.length > 0);
  if (message === undefined) return null;
  return message.length > GRAPHQL_MESSAGE_MAX ? `${message.slice(0, GRAPHQL_MESSAGE_MAX)}…` : message;
}

/** {@link graphqlErrorMessage} with a fallback, for a result envelope that must always carry a message. */
export function describeGraphqlFailure(payload: unknown, fallback = 'GitHub request failed'): string {
  return graphqlErrorMessage(payload) ?? fallback;
}

/**
 * Whether a failed call was refused for a missing OAuth scope.
 *
 * GitHub marks this with `"type":"INSUFFICIENT_SCOPES"` in the error object. Matched by substring on the
 * raw text rather than a parse, because on a query error `gh api graphql` writes the body with no clean
 * boundary from its own stderr line. `read:project` is matched for differently-worded refusals.
 */
export function scopeErrorKind(output: string): ForgeProjectReadKind {
  return /INSUFFICIENT_SCOPES/.test(output) || /\bread:project\b/.test(output)
    ? 'insufficient-scope'
    : 'error';
}

/** The `{ ok } | { ok:false }` outcome every mutation parser returns. */
export type MutationResult = { ok: true } | { ok: false; kind: 'error'; message: string };

/** `errors[]` present (or no `data`) means failure; the message comes from {@link describeGraphqlFailure}. */
export function mutationResult(payload: unknown): MutationResult {
  const errors = asArray(pick(payload, 'errors'));
  if (errors.length > 0 || pick(payload, 'data') == null) {
    return { ok: false, kind: 'error', message: describeGraphqlFailure(payload) };
  }
  return { ok: true };
}
