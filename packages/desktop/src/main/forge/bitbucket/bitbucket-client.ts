import type { Forge, ForgeAccount, ForgeCliStatus } from '@midnite/studio-shared';

import { forgeAccountToken } from '../forge-accounts';
import { forgeHttpRequest, type ForgeHttpMethod } from '../http';

/**
 * The Bitbucket Cloud REST 2.0 binding over `http.ts` — auth resolution,
 * base URL, pagination, and the `ForgeCliStatus` this adapter reports in
 * place of `gh`'s own three-reason vocabulary (see `adapter.ts`'s deferred
 * fourth-reason note: `not-authenticated` here honestly covers both "no
 * account" and "the stored token was rejected").
 *
 * **Self-hosted Bitbucket Data Center is out of scope** (phase doc, "Not in
 * this phase") — a different API version entirely — so the base URL is fixed
 * rather than built from `forge.host`.
 */
const API_BASE = 'https://api.bitbucket.org/2.0';
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Basic auth: the account's own login as the username, its vaulted token
 * (an App Password or a workspace/repository access token) as the password —
 * the shape the phase doc names explicitly, and the reason `http.ts` takes
 * auth as a strategy rather than a bearer-only header (Bitbucket is the one
 * of the three new providers that does not use a bearer token for its real
 * read/write traffic; `whoami.ts`'s bearer call is validation-only, a
 * narrower path Theme B built before this adapter existed).
 */
export type BitbucketCredential = { username: string; password: string };

async function resolveCredential(account: ForgeAccount | null): Promise<BitbucketCredential | null> {
  if (!account || account.delegated !== null) return null;
  const token = await forgeAccountToken(account);
  if (!token) return null;
  return { username: account.login, password: token };
}

/**
 * Whether this adapter can currently reach Bitbucket on this account's
 * behalf. `not-authenticated` is deliberately reused for "no Bitbucket
 * account is active" as well as "the stored token no longer works" — the
 * same overload `noForgeStatus()` already makes for a forge kind with no
 * adapter at all, and the one `ForgeCliStatus` was designed to carry.
 */
export async function bitbucketCliStatus(account: ForgeAccount | null): Promise<ForgeCliStatus> {
  const credential = await resolveCredential(account);
  if (!credential) {
    return {
      reason: 'not-authenticated',
      binPath: null,
      hint: 'Add a Bitbucket account (a workspace access token or an App Password) in Settings ▸ Accounts.',
    };
  }
  return { reason: 'ready', binPath: null, hint: '' };
}

export type BitbucketResult<T> =
  | { ok: true; cli: ForgeCliStatus; data: T }
  | { ok: false; cli: ForgeCliStatus; error: string | null; status?: number | null };

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * One authenticated request against `/2.0`. Every adapter read/write goes
 * through this, so the "no account" short-circuit and the error shape are
 * defined exactly once.
 */
export async function bitbucketRequest<T = unknown>(
  account: ForgeAccount | null,
  method: ForgeHttpMethod,
  path: string,
  options: { query?: Record<string, string | number | undefined>; json?: unknown; responseType?: 'json' | 'text' } = {},
): Promise<BitbucketResult<T>> {
  const cli = await bitbucketCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: null };

  const credential = await resolveCredential(account);
  if (!credential) return { ok: false, cli, error: null }; // resolved by bitbucketCliStatus above; kept for the type checker

  const result = await forgeHttpRequest<T>({
    method,
    url: apiUrl(path),
    auth: { kind: 'basic', username: credential.username, password: credential.password },
    query: options.query,
    json: options.json,
    responseType: options.responseType,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!result.ok) return { ok: false, cli, error: result.error, status: result.status };
  return { ok: true, cli, data: result.data };
}

export function repoPath(forge: Forge, suffix: string): string {
  return `/repositories/${encodeURIComponent(forge.owner)}/${encodeURIComponent(forge.repo)}${suffix}`;
}

type PageResponse<T> = { values?: T[]; next?: string };

/**
 * Follow Bitbucket's `next`-URL pagination up to `limit` items — the same
 * server-side-limit contract `ForgePullScope`'s docblock insists on for
 * `gh`: a page narrowed after the fact is not the same as a limited fetch.
 */
export async function bitbucketPaginate<T>(
  account: ForgeAccount | null,
  firstPath: string,
  query: Record<string, string | number | undefined>,
  limit: number,
): Promise<BitbucketResult<T[]>> {
  const cli = await bitbucketCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: null };

  const credential = await resolveCredential(account);
  if (!credential) return { ok: false, cli, error: null };

  const values: T[] = [];
  let url: string | null = apiUrl(firstPath);
  let firstRequest = true;

  while (url && values.length < limit) {
    const result: Awaited<ReturnType<typeof forgeHttpRequest<PageResponse<T>>>> = await forgeHttpRequest({
      method: 'GET',
      url,
      auth: { kind: 'basic', username: credential.username, password: credential.password },
      query: firstRequest ? query : undefined, // `next` already carries every query param.
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    firstRequest = false;
    if (!result.ok) return { ok: false, cli, error: result.error };
    values.push(...(result.data.values ?? []));
    url = result.data.next ?? null;
  }

  return { ok: true, cli, data: values.slice(0, limit) };
}
