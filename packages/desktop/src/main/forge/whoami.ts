import type { ForgeKind } from '@midnite/studio-shared';

import { runInShell } from './github/gh-shell';
import { parseJsonPayload } from './github/gh-parse';

/**
 * "Who am I" — the first identity resolution this app has ever done (Phase 90
 * Theme B). Adding an account is the same call as validating its token: a PAT
 * that cannot answer this never reaches `forge-accounts.ts`.
 *
 * **Deliberately minimal, and not `main/forge/http.ts`.** Theme D specifies a
 * shared HTTP client with a per-provider auth *strategy* (bearer, basic,
 * `PRIVATE-TOKEN`), a JSON envelope, `Retry-After` handling and a per-host
 * budget — the real client every read/write adapter in Themes E-G will use.
 * That module does not exist yet, and Theme B does not build it: this file is
 * just enough auth per provider to answer one GET each, so an account can be
 * added before an adapter exists for it. When `http.ts` lands, this module's
 * three `fetch` calls are what it replaces.
 */
export type WhoamiResult = { login: string; displayName: string; avatarUrl: string | null };

const WHOAMI_TIMEOUT_MS = 10_000;

/** Only `https:` — a forge's own API response is attacker-shaped once we
 *  render it, and an avatar is the one field here that reaches an `<img src>`. */
function sanitizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * `gh api user` — GitHub's own whoami, through the same shell every other
 * GitHub read goes through. Used only to validate a token supplied for a
 * *second* GitHub identity (the discovered, `gh`-delegated account never
 * calls this); see `forge-accounts.ts`'s `addAccount`.
 */
export async function githubWhoami(host: string, token?: string): Promise<WhoamiResult | null> {
  const hostFlag = host === 'github.com' ? '' : ` --hostname '${host.replaceAll("'", `'\\''`)}'`;
  // `GH_TOKEN` overrides the CLI's own stored credential for exactly this one
  // invocation — the mechanism `gh` itself documents for scripting a
  // one-off call under a different token without touching `gh auth login`.
  const command = `gh api user${hostFlag}`;
  const result = await runInShell(
    token ? `env GH_TOKEN=${shellQuoteToken(token)} ${command}` : command,
    WHOAMI_TIMEOUT_MS,
  );
  const payload = parseJsonPayload(result.output);
  if (payload === null || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const login = asString(row['login']);
  if (!login) return null;
  return {
    login,
    displayName: asString(row['name']) ?? login,
    avatarUrl: sanitizeAvatarUrl(row['avatar_url']),
  };
}

/** Single-quoted for the same reason `shellQuote` in `gh-shell.ts` is — a
 *  token is attacker-shaped in the same sense any pasted string is. */
function shellQuoteToken(token: string): string {
  return `'${token.replaceAll("'", `'\\''`)}'`;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHOAMI_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** GitLab `GET /user` — a PAT's own identity. `PRIVATE-TOKEN`, not `Bearer`:
 *  the header GitLab's REST API has documented for a personal access token
 *  since before `Authorization: Bearer` was accepted as an alternative. */
async function gitlabWhoami(host: string, token: string): Promise<WhoamiResult | null> {
  const row = await fetchJson(`https://${host}/api/v4/user`, { 'PRIVATE-TOKEN': token });
  const login = row && asString(row['username']);
  if (!row || !login) return null;
  return {
    login,
    displayName: asString(row['name']) ?? login,
    avatarUrl: sanitizeAvatarUrl(row['avatar_url']),
  };
}

/** Bitbucket `GET /2.0/user` — a workspace API token authenticates as a
 *  bearer credential; the older App Password's Basic-auth shape is Theme F's
 *  concern once it builds the real read/write adapter. */
async function bitbucketWhoami(token: string): Promise<WhoamiResult | null> {
  const row = await fetchJson('https://api.bitbucket.org/2.0/user', {
    Authorization: `Bearer ${token}`,
  });
  const login = row && (asString(row['username']) ?? asString(row['account_id']));
  if (!row || !login) return null;
  const links = row['links'] as Record<string, unknown> | undefined;
  const avatar = links?.['avatar'] as Record<string, unknown> | undefined;
  return {
    login,
    displayName: asString(row['display_name']) ?? login,
    avatarUrl: sanitizeAvatarUrl(avatar?.['href']),
  };
}

/**
 * Azure DevOps `GET /_apis/profile/profiles/me` — Basic auth, empty username,
 * the PAT as the password (a third auth shape, and the reason Theme D's
 * `http.ts` takes auth as a strategy rather than a header string). Azure has
 * no traditional login: identity there is the profile's email, so that is
 * what this reports as `login`.
 */
async function azureWhoami(token: string): Promise<WhoamiResult | null> {
  const basic = Buffer.from(`:${token}`, 'utf8').toString('base64');
  const row = await fetchJson(
    'https://vssps.dev.azure.com/_apis/profile/profiles/me?api-version=7.1',
    { Authorization: `Basic ${basic}` },
  );
  const login = row && (asString(row['emailAddress']) ?? asString(row['id']));
  if (!row || !login) return null;
  return {
    login,
    displayName: asString(row['displayName']) ?? login,
    // Azure's avatar lives behind a separate Graph/Avatar API call this
    // minimal client does not make — `null` here is honest, not a bug.
    avatarUrl: null,
  };
}

/** Dispatch by kind. `github` is the one path that can validate with no
 *  token at all — see `forge-accounts.ts` for when that happens. */
export async function whoami(
  kind: ForgeKind,
  host: string,
  token?: string,
): Promise<WhoamiResult | null> {
  switch (kind) {
    case 'github':
      return githubWhoami(host, token);
    case 'gitlab':
      return token ? gitlabWhoami(host, token) : null;
    case 'bitbucket':
      return token ? bitbucketWhoami(token) : null;
    case 'azure':
      return token ? azureWhoami(token) : null;
    case 'unknown':
      return null;
  }
}
