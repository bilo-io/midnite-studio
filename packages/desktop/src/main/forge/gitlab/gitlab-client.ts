import type { Forge, ForgeAccount, ForgeCliStatus } from '@midnite/studio-shared';

import { forgeAccountToken } from '../forge-accounts';
import { forgeHttpRequest, type ForgeHttpMethod } from '../http';

/**
 * GitLab REST v4 over a personal access token — the thin binding every
 * `gitlab/*.ts` read and write goes through, the same role
 * `bitbucket-client.ts` plays for Bitbucket Cloud.
 *
 * Built over `../http.ts`, the provider-neutral HTTP client Theme F
 * (Bitbucket, PR #504) landed against its own first real caller after Theme
 * D deferred it. This module independently wrote (and briefly shipped) a
 * near-identical client under the same path before discovering #504 had
 * already merged — reconciled onto that one rather than keeping two: same
 * auth-as-a-strategy shape, same per-host budget, one `Retry-After` retry.
 *
 * **A PAT, not `glab`.** The phase doc's own Decisions section settles this:
 * `glab` is the one provider where a CLI would work, and using it there would
 * mean two architectures for three new providers. `api` scope is what a
 * write needs; `read_api` is enough for every read and is what the settings
 * page should recommend first (also from the phase doc).
 *
 * **The account's token is resolved lazily, per call — never bound once and
 * cached.** `registry.ts`'s `adapterFor` closes over `account`, not a
 * resolved credential, matching the shape Theme F already settled on:
 * `bitbucket-client.ts`'s `resolveCredential` does the identical lazy read.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export function projectId(forge: Forge): string {
  return encodeURIComponent(`${forge.owner}/${forge.repo}`);
}

/** Exported so `whoami` bindings and the `review-requested` scope lookup
 *  (`gitlab-read.ts`) can resolve the same token this module's own requests
 *  use, without a second vault read implementation. */
export async function resolveToken(account: ForgeAccount | null): Promise<string | null> {
  if (!account || account.delegated !== null) return null;
  return forgeAccountToken(account);
}

/**
 * Whether this adapter can currently reach GitLab on this account's behalf.
 * `not-authenticated` is deliberately reused for "no GitLab account is
 * active" as well as "the stored token no longer works" — the same overload
 * `bitbucketCliStatus` already makes, and the one `ForgeCliStatus` was
 * designed to carry (there is no `not-installed` arm to reach: an HTTP
 * adapter has nothing to install).
 */
export async function gitlabCliStatus(account: ForgeAccount | null): Promise<ForgeCliStatus> {
  const token = await resolveToken(account);
  if (!token) {
    return {
      reason: 'not-authenticated',
      binPath: null,
      hint: 'Add a GitLab account with a personal access token in Settings ▸ Accounts.',
    };
  }
  return { reason: 'ready', binPath: null, hint: '' };
}

export type GitLabResult<T> =
  | { ok: true; cli: ForgeCliStatus; data: T; headers: Record<string, string> }
  | { ok: false; cli: ForgeCliStatus; error: string | null; status?: number | null };

function apiUrl(forge: Forge, path: string): string {
  return `https://${forge.host}/api/v4/${path}`;
}

/**
 * One authenticated request against `/api/v4`. Every adapter read/write goes
 * through this, so the "no account" short-circuit and the error shape are
 * defined exactly once — the same role `bitbucketRequest` plays.
 */
export async function glRequest<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  method: ForgeHttpMethod,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    json?: unknown;
    responseType?: 'json' | 'text';
  } = {},
): Promise<GitLabResult<T>> {
  const cli = await gitlabCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: null };

  const token = await resolveToken(account);
  if (!token) return { ok: false, cli, error: null }; // resolved by gitlabCliStatus above; kept for the type checker

  const result = await forgeHttpRequest<T>({
    method,
    url: apiUrl(forge, path),
    auth: { kind: 'header', name: 'PRIVATE-TOKEN', value: token },
    query: options.query,
    json: options.json,
    responseType: options.responseType,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!result.ok) return { ok: false, cli, error: result.error, status: result.status };
  return { ok: true, cli, data: result.data, headers: result.headers };
}

export async function glGet<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<GitLabResult<T>> {
  return glRequest<T>(forge, account, 'GET', path, { query });
}

export async function glPost<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  json?: unknown,
): Promise<GitLabResult<T>> {
  return glRequest<T>(forge, account, 'POST', path, { json: json ?? {} });
}

export async function glPut<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  json?: unknown,
): Promise<GitLabResult<T>> {
  return glRequest<T>(forge, account, 'PUT', path, { json: json ?? {} });
}

/** A job or pipeline trace — plain text, never JSON. */
export async function glTrace(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
): Promise<GitLabResult<string>> {
  return glRequest<string>(forge, account, 'GET', path, { responseType: 'text' });
}

/** `x-next-page` off a listing response — GitLab's own pagination header,
 *  empty when the current page is the last one. */
export function nextPageCursor(headers: Record<string, string>): string | null {
  const next = headers['x-next-page'];
  return next && next.length > 0 ? next : null;
}
