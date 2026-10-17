import type { Forge, ForgeAccount, ForgeCliStatus } from '@midnite/studio-shared';

import { forgeAccountToken } from '../forge-accounts';
import { forgeHttpRequest, type ForgeHttpMethod } from '../http';

/**
 * Azure DevOps REST 7.1 over `../http.ts` — the third binding, after
 * `gitlab-client.ts` and `bitbucket-client.ts`, and the one that finally
 * exercises `ForgeHttpAuth`'s `basic` arm with an **empty username**: a PAT
 * authenticates as `Basic base64(":" + pat)`, no login of its own (see
 * `whoami.ts`'s `azureWhoami`, which already does this by hand — this module
 * is the same shape moved onto the shared client).
 *
 * **Always `dev.azure.com`, never `forge.host`.** Every Azure org — new or
 * migrated from the legacy `{org}.visualstudio.com` — is reachable through
 * the unified `dev.azure.com/{org}/{project}/_apis/...` route, which is
 * exactly why `Forge.owner` carries `{org}/{project}` for this kind (Theme A).
 * `forge.host` still matters for *display* (the project page a user clicks
 * into), but every API call here is built off `forge.owner` alone — the same
 * "ignore `forge.host`, self-hosted is out of scope" call
 * `bitbucket-client.ts` makes for Data Center, except here it is that every
 * host variant resolves to the same API surface rather than a surface this
 * app does not support.
 */
const API_HOST = 'https://dev.azure.com';
const API_VERSION = '7.1';
const REQUEST_TIMEOUT_MS = 20_000;

/** Resolves the account's vaulted PAT lazily, per call — the same discipline
 *  `gitlab-client.ts`'s `resolveToken` and `bitbucket-client.ts`'s
 *  `resolveCredential` already hold to. */
export async function resolveAzureToken(account: ForgeAccount | null): Promise<string | null> {
  if (!account || account.delegated !== null) return null;
  return forgeAccountToken(account);
}

export async function azureCliStatus(account: ForgeAccount | null): Promise<ForgeCliStatus> {
  const token = await resolveAzureToken(account);
  if (!token) {
    return {
      reason: 'not-authenticated',
      binPath: null,
      hint: 'Add an Azure DevOps account with a personal access token in Settings ▸ Accounts.',
    };
  }
  return { reason: 'ready', binPath: null, hint: '' };
}

export type AzureResult<T> =
  | { ok: true; cli: ForgeCliStatus; data: T; headers: Record<string, string> }
  | { ok: false; cli: ForgeCliStatus; error: string | null; status?: number | null };

/** `{org}/{project}` — every route below is built under this. */
function orgProjectPath(forge: Forge): string {
  return forge.owner
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

function apiUrl(forge: Forge, path: string): string {
  return `${API_HOST}/${orgProjectPath(forge)}/_apis/${path}`;
}

/** A route with no `{project}` segment — team listing is org-scoped, not
 *  project-scoped, in Azure's own hierarchy. */
function orgApiUrl(forge: Forge, path: string): string {
  const org = forge.owner.split('/')[0] ?? '';
  return `${API_HOST}/${encodeURIComponent(org)}/_apis/${path}`;
}

/** Azure Boards nests one level deeper still — `{org}/{project}/{team}/
 *  _apis/...` — which is why `azGet`'s `team` option routes here instead of
 *  through `apiUrl`. */
function teamApiUrl(forge: Forge, team: string, path: string): string {
  return `${API_HOST}/${orgProjectPath(forge)}/${encodeURIComponent(team)}/_apis/${path}`;
}

/**
 * One authenticated request against `_apis`. Every read/write in this
 * adapter goes through this, matching `glRequest`/`bitbucketRequest`'s own
 * role: the "no account" short-circuit and the error shape are defined once.
 */
export async function azureRequest<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  method: ForgeHttpMethod,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    json?: unknown;
    responseType?: 'json' | 'text';
    orgScoped?: boolean;
    /** Routes through `teamApiUrl` — Azure Boards' own `{org}/{project}/{team}/_apis/...` nesting. */
    team?: string;
    contentType?: string;
  } = {},
): Promise<AzureResult<T>> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { ok: false, cli, error: null };

  const token = await resolveAzureToken(account);
  if (!token) return { ok: false, cli, error: null }; // resolved by azureCliStatus above; kept for the type checker

  const url = options.team
    ? teamApiUrl(forge, options.team, path)
    : options.orgScoped
      ? orgApiUrl(forge, path)
      : apiUrl(forge, path);
  const result = await forgeHttpRequest<T>({
    method,
    url,
    auth: { kind: 'basic', username: '', password: token },
    query: { 'api-version': API_VERSION, ...options.query },
    json: options.json,
    responseType: options.responseType,
    contentType: options.contentType,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!result.ok) return { ok: false, cli, error: result.error, status: result.status };
  return { ok: true, cli, data: result.data, headers: result.headers };
}

export async function azGet<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
  options: { orgScoped?: boolean; team?: string; responseType?: 'json' | 'text' } = {},
): Promise<AzureResult<T>> {
  return azureRequest<T>(forge, account, 'GET', path, { query, ...options });
}

export async function azPut<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  json?: unknown,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<AzureResult<T>> {
  return azureRequest<T>(forge, account, 'PUT', path, { json: json ?? {}, query });
}

export async function azPost<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  json?: unknown,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<AzureResult<T>> {
  return azureRequest<T>(forge, account, 'POST', path, { json: json ?? {}, query });
}

/**
 * A plain-JSON `PATCH` — pull request completion, the draft flag, and a
 * thread's `status`, all of which take an ordinary JSON object body under
 * the default `application/json` content type.
 */
export async function azPatch<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  json: unknown,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<AzureResult<T>> {
  return azureRequest<T>(forge, account, 'PATCH', path, { json, query });
}

/**
 * Work items are updated with a JSON Patch document, and Azure DevOps's own
 * REST contract requires `Content-Type: application/json-patch+json` for it
 * — the one Azure call in this adapter that could not reuse `azPatch`'s
 * default content type, which is why `http.ts` grew a `contentType` override
 * for this single caller.
 */
export async function azWorkItemPatch<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  path: string,
  ops: Array<{ op: 'add' | 'replace'; path: string; value: unknown }>,
): Promise<AzureResult<T>> {
  return azureRequest<T>(forge, account, 'PATCH', path, {
    json: ops,
    contentType: 'application/json-patch+json',
  });
}

/**
 * `POST .../wit/workitems/${'$' + type}` — work item *creation* (Phase 95
 * Theme D), `azWorkItemPatch`'s own sibling for `POST` rather than `PATCH`:
 * the same JSON-Patch document and the same `application/json-patch+json`
 * content type, against the one endpoint that creates instead of updating.
 * The literal `$` before the type name is part of Azure's own route, not a
 * template artefact — `$Task`, `$Issue`, `$Bug`.
 */
export async function azWorkItemCreate<T = unknown>(
  forge: Forge,
  account: ForgeAccount | null,
  workItemType: string,
  ops: Array<{ op: 'add' | 'replace'; path: string; value: unknown }>,
): Promise<AzureResult<T>> {
  return azureRequest<T>(forge, account, 'POST', `wit/workitems/$${encodeURIComponent(workItemType)}`, {
    json: ops,
    contentType: 'application/json-patch+json',
  });
}

/** `{repositoryId or name}` path segment for a git-scoped call. */
export function repoSegment(forge: Forge): string {
  return encodeURIComponent(forge.repo);
}

const workItemTypeStateCache = new Map<string, Map<string, string>>();

/**
 * `System.State` → its category (`Proposed`/`InProgress`/`Resolved`/
 * `Completed`/`Removed`) for one work item type, cached per `{org/project,
 * type}` for the life of the process — a project's process template does not
 * change between two reads in the same session, and this call is paid once
 * per type rather than once per work item (`azure-reads.ts`'s `listIssues`
 * would otherwise pay it per row).
 *
 * This is what makes "map the state's category, not the name" (the phase
 * doc's own instruction — state names are a per-project, per-template
 * vocabulary; categories are the fixed, five-value set every template maps
 * onto) possible without hard-coding a name list.
 */
export async function stateCategoriesFor(
  forge: Forge,
  account: ForgeAccount | null,
  workItemType: string,
): Promise<Map<string, string> | null> {
  const cacheKey = `${forge.owner}:${workItemType}`;
  const cached = workItemTypeStateCache.get(cacheKey);
  if (cached) return cached;

  const result = await azGet<{ value?: Array<{ name?: unknown; category?: unknown }> }>(
    forge,
    account,
    `wit/workitemtypes/${encodeURIComponent(workItemType)}/states`,
  );
  if (!result.ok) return null;

  const map = new Map<string, string>();
  for (const row of result.data.value ?? []) {
    if (typeof row.name === 'string' && typeof row.category === 'string') map.set(row.name, row.category);
  }
  workItemTypeStateCache.set(cacheKey, map);
  return map;
}

const repositoryIdCache = new Map<string, string>();

/**
 * The git repository's own GUID — required by the Build API's
 * `repositoryId` filter (which, unlike every Git-API route in this module,
 * does not accept a repo *name*). Cached per `{org/project}/{repo}` for the
 * same reason `stateCategoriesFor` caches: a repository's id is immutable
 * for the life of this process's session.
 */
export async function repositoryIdFor(forge: Forge, account: ForgeAccount | null): Promise<string | null> {
  const cacheKey = `${forge.owner}/${forge.repo}`;
  const cached = repositoryIdCache.get(cacheKey);
  if (cached) return cached;

  const result = await azGet<{ id?: unknown }>(forge, account, `git/repositories/${repoSegment(forge)}`);
  if (!result.ok) return null;
  const id = typeof result.data.id === 'string' ? result.data.id : null;
  if (id) repositoryIdCache.set(cacheKey, id);
  return id;
}

const defaultTeamCache = new Map<string, string>();

/**
 * The project's own default team — Azure Boards is scoped `{org}/{project}/
 * {team}`, and the public REST API has no "boards for this project,
 * whichever team" shortcut. Resolved as the first team `GET .../teams`
 * returns, which for the common single-team project is exactly the
 * `{project} Team` Azure creates by default; a genuinely multi-team project
 * would need a team picker this theme does not build (`azure-board.ts`'s own
 * docblock says so at its first call site).
 */
export async function defaultTeamFor(forge: Forge, account: ForgeAccount | null): Promise<string | null> {
  const org = forge.owner.split('/')[0] ?? '';
  const project = forge.owner.slice(org.length + 1);
  const cacheKey = forge.owner;
  const cached = defaultTeamCache.get(cacheKey);
  if (cached) return cached;

  const result = await azGet<{ value?: Array<{ name?: unknown }> }>(
    forge,
    account,
    `projects/${encodeURIComponent(project)}/teams`,
    undefined,
    { orgScoped: true },
  );
  if (!result.ok) return null;
  const name = result.data.value?.[0]?.name;
  if (typeof name !== 'string' || name.length === 0) return null;
  defaultTeamCache.set(cacheKey, name);
  return name;
}

/** Test-only reset — the module-level caches above would otherwise leak
 *  between test cases the way `http.ts`'s own host budget does. */
export function __resetAzureStateCacheForTests(): void {
  workItemTypeStateCache.clear();
  repositoryIdCache.clear();
  defaultTeamCache.clear();
}
