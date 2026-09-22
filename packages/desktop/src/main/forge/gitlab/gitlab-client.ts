import type { Forge, ForgeCliStatus } from '@midnite/studio-shared';

import type { HttpAuthStrategy, HttpRequestOptions, HttpResult } from '../http';
import { requestJson, requestText } from '../http';

/**
 * GitLab REST v4 over a personal access token — the thin binding every
 * `gitlab/*.ts` read and write goes through, the same role `gh-shell.ts`
 * plays for GitHub's subprocess path.
 *
 * **A PAT, not `glab`.** The phase doc's own Decisions section settles this:
 * `glab` is the one provider where a CLI would work, and using it there would
 * mean two architectures for three new providers. `api` scope is what a
 * write needs; `read_api` is enough for every read and is what the settings
 * page should recommend first (also from the phase doc).
 */
export type GitLabContext = {
  readonly host: string;
  /** Empty string means "no account, or its token could not be loaded" —
   *  every read/write below treats that identically to `gh`'s own
   *  `not-authenticated` reason, never as a network call worth attempting. */
  readonly token: string;
};

const LIST_TIMEOUT_MS = 15_000;
const TRACE_TIMEOUT_MS = 30_000;

function baseUrl(host: string): string {
  return `https://${host}/api/v4/`;
}

function auth(ctx: GitLabContext): HttpAuthStrategy {
  return { kind: 'header', name: 'PRIVATE-TOKEN', value: ctx.token };
}

/**
 * The `:id` every project-scoped GitLab route takes — `owner/repo` (which,
 * for a subgroup, is `group/subgroup/repo`; `Forge.owner` already carries
 * the whole path, per `remote.ts`'s own docblock), URL-encoded whole rather
 * than resolved to a numeric id first. GitLab accepts either; the encoded
 * path costs no extra lookup.
 */
export function projectId(forge: Forge): string {
  return encodeURIComponent(`${forge.owner}/${forge.repo}`);
}

/**
 * Whether this context can even attempt a call — `ready` when a token was
 * resolved, `not-authenticated` when it was not. There is no `not-installed`
 * arm to reach: an HTTP adapter has nothing to install (Theme D's own note on
 * `ForgeCliStatus`'s vocabulary).
 */
export function gitlabCliStatus(ctx: GitLabContext): ForgeCliStatus {
  if (ctx.token.length === 0) {
    return {
      reason: 'not-authenticated',
      binPath: null,
      hint: 'Add a GitLab account with a personal access token in Settings ▸ Accounts.',
    };
  }
  return { reason: 'ready', binPath: null, hint: '' };
}

export async function glGet<T>(
  ctx: GitLabContext,
  path: string,
  query?: HttpRequestOptions['query'],
): Promise<HttpResult<T>> {
  return requestJson<T>(baseUrl(ctx.host), path, auth(ctx), { query, timeoutMs: LIST_TIMEOUT_MS });
}

export async function glPost<T>(
  ctx: GitLabContext,
  path: string,
  body?: unknown,
): Promise<HttpResult<T>> {
  return requestJson<T>(baseUrl(ctx.host), path, auth(ctx), { method: 'POST', body: body ?? {} });
}

export async function glPut<T>(ctx: GitLabContext, path: string, body?: unknown): Promise<HttpResult<T>> {
  return requestJson<T>(baseUrl(ctx.host), path, auth(ctx), { method: 'PUT', body: body ?? {} });
}

/** A job or pipeline trace — plain text, never JSON. */
export async function glTrace(ctx: GitLabContext, path: string): Promise<HttpResult<string>> {
  return requestText(baseUrl(ctx.host), path, auth(ctx), { timeoutMs: TRACE_TIMEOUT_MS });
}

/** `x-next-page` off a listing response — GitLab's own pagination header,
 *  empty when the current page is the last one. */
export function nextPageCursor(headers: Record<string, string>): string | null {
  const next = headers['x-next-page'];
  return next && next.length > 0 ? next : null;
}
