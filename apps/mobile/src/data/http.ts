// The transport under `GitHubDataSource` (Phase 146 Theme E2): `fetch` to GitHub's GraphQL and REST endpoints, with
// every failure folded into a `Result`. The token is read per request from `getToken` and only ever lands in the
// Authorization header — never in a URL, a log line or an error message.
import { describeGraphqlFailure, type GraphqlRequest } from '@midnite/forge-github-core';
import { fail, ok, type Result } from './source';

export const GRAPHQL_URL = 'https://api.github.com/graphql';
export const REST_BASE = 'https://api.github.com';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpDeps {
  fetch: FetchLike;
  getToken: () => string | null | Promise<string | null>;
}

const HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

function statusFailure(status: number, body: unknown): Result<never> | null {
  if (status === 401) return fail('auth', 'GitHub rejected the token');
  if (status === 403 || status === 404) {
    const text = JSON.stringify(body ?? '');
    if (/scope|read:project|Resource not accessible|INSUFFICIENT_SCOPES/i.test(text)) {
      return fail('scope', 'The token is missing a required scope');
    }
    return fail('error', status === 404 ? 'Not found' : 'GitHub refused the request');
  }
  if (status >= 400) return fail('error', `GitHub returned ${status}`);
  return null;
}

async function send(deps: HttpDeps, url: string, init: RequestInit): Promise<Result<Response>> {
  const token = await deps.getToken();
  if (!token) return fail('auth', 'Not signed in');
  try {
    const response = await deps.fetch(url, {
      ...init,
      headers: { ...HEADERS, ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    });
    return ok(response);
  } catch (error) {
    // A network failure from fetch is a TypeError; anything else is not the network's fault.
    return error instanceof TypeError ? fail('network', 'Network request failed') : fail('error', 'Request failed');
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** POST a GraphQL request and return the response's `data` object. */
export async function graphql(deps: HttpDeps, request: GraphqlRequest): Promise<Result<unknown>> {
  const sent = await send(deps, GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!sent.ok) return sent;
  const body = await readJson(sent.value);
  const failure = statusFailure(sent.value.status, body);
  if (failure) return failure;
  const errors = (body as { errors?: unknown } | null)?.errors;
  const data = (body as { data?: unknown } | null)?.data;
  if (Array.isArray(errors) && errors.length > 0) {
    // A GraphQL error can accompany partial data; with none, it is the failure.
    if (data == null) {
      const kind = /INSUFFICIENT_SCOPES|\bread:project\b/.test(JSON.stringify(errors)) ? 'scope' : /Bad credentials/i.test(JSON.stringify(errors)) ? 'auth' : 'error';
      return fail(kind, kind === 'scope' ? 'The token is missing a required scope' : describeGraphqlFailure(body));
    }
  }
  if (data == null) return fail('error', describeGraphqlFailure(body));
  return ok(data);
}

/** GET a REST path (relative to the API root, or an absolute `Link` URL); returns the JSON body and `Link` header. */
export async function rest(deps: HttpDeps, pathOrUrl: string): Promise<Result<{ body: unknown; link: string | null }>> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${REST_BASE}${pathOrUrl}`;
  if (!url.startsWith(`${REST_BASE}/`)) return fail('error', 'Refusing a non-GitHub URL');
  const sent = await send(deps, url, { method: 'GET' });
  if (!sent.ok) return sent;
  const body = await readJson(sent.value);
  const failure = statusFailure(sent.value.status, body);
  if (failure) return failure;
  return ok({ body, link: sent.value.headers.get('Link') });
}

/** The `rel="next"` URL of a `Link` header, or null. */
export function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(',')) {
    const match = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (match?.[1]) return match[1];
  }
  return null;
}
