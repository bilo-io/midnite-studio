import type { Forge, ForgeAccount, ReachableRepo, ReachableReposResult } from '@midnite/studio-shared';

import { azGet } from './azure/azure-client';
import { forgeAccountToken } from './forge-accounts';
import { describeFailure, runInShell, shellQuote, LIST_TIMEOUT_MS } from './github/gh-shell';
import { parseJsonPayload } from './github/gh-parse';
import { glGet } from './gitlab/gitlab-client';
import { forgeHttpRequest } from './http';

/**
 * "Repositories I can reach" — the repo picker's clone-or-open listing
 * (Phase 90 Theme C). A listing only: nothing here ever runs `git clone`
 * itself, matching Phase 49's settled posture that the app writes only what
 * the user pointed it at (`repo-handlers.ts`'s `repoClone` is the separate,
 * explicit write this listing feeds).
 *
 * **GitHub, GitLab and Azure DevOps today.** `capabilitiesFor(kind).repoListing`
 * reports `'full'` for all three — Azure's row as of Phase 90 Theme G, which
 * is the "next theme lands a real client" this module's own docblock
 * anticipated for the last of them. Bitbucket still reports `'none'`
 * (Theme F's own scoped-down write surface left it there); building a real
 * listing for it here would be building work Theme F itself declined.
 */
export async function listReachableRepos(account: ForgeAccount): Promise<ReachableReposResult> {
  if (account.kind === 'github') return githubReachableRepos(account);
  if (account.kind === 'gitlab') return gitlabReachableRepos(account);
  if (account.kind === 'azure') return azureReachableRepos(account);
  return { ok: false, reason: 'unsupported' };
}

/**
 * `gh repo list` — exactly the call the phase doc names. No `--hostname`
 * flag exists on this subcommand (unlike `gh api`'s), so a non-default host
 * (GitHub Enterprise) goes through `GH_HOST` instead, the environment
 * variable `gh` itself documents for overriding which host a command talks
 * to for one invocation.
 */
async function githubReachableRepos(account: ForgeAccount): Promise<ReachableReposResult> {
  const hostEnv = account.host === 'github.com' ? '' : `env GH_HOST=${shellQuote(account.host)} `;
  const command = `${hostEnv}gh repo list --json nameWithOwner,url,isPrivate --limit 100`;
  const result = await runInShell(command, LIST_TIMEOUT_MS);
  const payload = parseJsonPayload(result.output);
  if (payload === null || !Array.isArray(payload)) {
    return { ok: false, reason: 'error', message: describeFailure(result.output) };
  }

  const repos: ReachableRepo[] = [];
  for (const row of payload) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const fullName = typeof r['nameWithOwner'] === 'string' ? r['nameWithOwner'] : null;
    const url = typeof r['url'] === 'string' ? r['url'] : null;
    if (!fullName || !url) continue;
    const slash = fullName.indexOf('/');
    if (slash <= 0 || slash === fullName.length - 1) continue;
    repos.push({
      owner: fullName.slice(0, slash),
      name: fullName.slice(slash + 1),
      fullName,
      url,
      private: r['isPrivate'] === true,
    });
  }
  return { ok: true, repos };
}

/**
 * `GET /projects?membership=true` — every project the token's owner is a
 * member of, across every namespace, the same "everything I can reach"
 * scope `gh repo list` gives for GitHub. `simple=true` trims the response to
 * the handful of fields this listing actually reads, which matters more here
 * than for `gh`'s own JSON: a full project payload carries statistics and
 * settings this call has no use for.
 */
async function gitlabReachableRepos(account: ForgeAccount): Promise<ReachableReposResult> {
  // `GET /projects` is account-wide, not repo-scoped — there is no real
  // `Forge` to build one from. `glGet` only reads `forge.host` for this
  // call (`projects` needs no `owner`/`repo`), so a synthetic one carrying
  // just the account's host is honest rather than a stand-in for a repo
  // that does not exist yet.
  const forge = { host: account.host, owner: '', repo: '', kind: 'gitlab' as const };
  const result = await glGet<unknown[]>(forge, account, 'projects', {
    membership: true,
    simple: true,
    per_page: 100,
    order_by: 'last_activity_at',
  });
  if (!result.ok) {
    if (result.cli.reason === 'not-authenticated') return { ok: false, reason: 'no-account' };
    return { ok: false, reason: 'error', message: result.error ?? undefined };
  }

  const repos: ReachableRepo[] = [];
  for (const raw of result.data) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const fullName = typeof r['path_with_namespace'] === 'string' ? r['path_with_namespace'] : null;
    const url = typeof r['http_url_to_repo'] === 'string' ? r['http_url_to_repo'] : null;
    if (!fullName || !url) continue;
    const slash = fullName.lastIndexOf('/');
    if (slash <= 0 || slash === fullName.length - 1) continue;
    repos.push({
      // GitLab's `path` (the last segment) as `name`, and everything before
      // it — a group, or `group/subgroup` — as `owner`, matching
      // `remote.ts`'s own convention for a GitLab `Forge.owner`.
      owner: fullName.slice(0, slash),
      name: fullName.slice(slash + 1),
      fullName,
      url,
      private: r['visibility'] !== 'public',
    });
  }
  return { ok: true, repos };
}

const ACCOUNTS_LIST_TIMEOUT_MS = 15_000;

/**
 * Every organization the PAT's own owner belongs to — resolved once here
 * because, unlike GitHub/GitLab, **an Azure DevOps account has no org in it
 * at all**: `ForgeAccount.host` is the bare `dev.azure.com` every account
 * adds under (`accounts-page.tsx`'s `PROVIDER_LABEL`), and `login` is the
 * profile's email, not an org-qualified handle — Theme B's own `whoami`
 * never asked Azure "which org", because a PAT's identity is genuinely
 * tenant-wide, not org-scoped, until a specific `{org}/{project}` route is
 * called. `GET .../_apis/accounts` (Basic PAT auth, no `memberId` — it
 * defaults to the caller) is Azure's own answer to "which orgs can this
 * token see", and reachable-repos is the one place that gap has to be
 * closed to list anything at all.
 */
async function azureOrganizations(token: string): Promise<string[] | null> {
  const result = await forgeHttpRequest<{ value?: Array<Record<string, unknown>> }>({
    method: 'GET',
    url: 'https://app.vssps.visualstudio.com/_apis/accounts?api-version=7.1',
    auth: { kind: 'basic', username: '', password: token },
    timeoutMs: ACCOUNTS_LIST_TIMEOUT_MS,
  });
  if (!result.ok) return null;
  return (result.data.value ?? [])
    .map((row) => (typeof row === 'object' && row !== null ? row : null))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => row['accountName'])
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

/** Caps how much this listing will fan out — a person in dozens of
 *  organizations should still get a fast, bounded picker rather than this
 *  call blocking on the slowest one. */
const MAX_ORGS = 10;
const MAX_PROJECTS_PER_ORG = 25;

/**
 * Every git repository across every project in every org the account's PAT
 * can see. Azure has no single "repositories I can reach" endpoint the way
 * `gh repo list`/GitLab's `GET /projects` do — this walks orgs → projects →
 * repositories, matching the `{org}/{project}` two-level structure Theme A's
 * parser already carries in `Forge.owner`.
 */
async function azureReachableRepos(account: ForgeAccount): Promise<ReachableReposResult> {
  const token = await forgeAccountToken(account);
  if (!token) return { ok: false, reason: 'no-account' };

  const orgs = await azureOrganizations(token);
  if (orgs === null) return { ok: false, reason: 'error', message: 'Could not list this account’s Azure DevOps organizations.' };

  const repos: ReachableRepo[] = [];
  for (const org of orgs.slice(0, MAX_ORGS)) {
    const projectsForge: Forge = { host: account.host, owner: org, repo: '', kind: 'azure' };
    const projects = await azGet<{ value?: Array<Record<string, unknown>> }>(
      projectsForge,
      account,
      'projects',
      { $top: MAX_PROJECTS_PER_ORG },
      { orgScoped: true },
    );
    if (!projects.ok) continue; // An org this token cannot list projects for — skip rather than fail the whole listing.

    for (const raw of projects.data.value ?? []) {
      if (typeof raw !== 'object' || raw === null) continue;
      const project = raw as Record<string, unknown>;
      const projectName = typeof project['name'] === 'string' ? project['name'] : null;
      if (!projectName) continue;
      const isPrivate = project['visibility'] !== 'public';

      const repoForge: Forge = { host: account.host, owner: `${org}/${projectName}`, repo: '', kind: 'azure' };
      const result = await azGet<{ value?: Array<Record<string, unknown>> }>(repoForge, account, 'git/repositories');
      if (!result.ok) continue;

      for (const rawRepo of result.data.value ?? []) {
        if (typeof rawRepo !== 'object' || rawRepo === null) continue;
        const r = rawRepo as Record<string, unknown>;
        const name = typeof r['name'] === 'string' ? r['name'] : null;
        const url = typeof r['remoteUrl'] === 'string' ? r['remoteUrl'] : null;
        if (!name || !url) continue;
        repos.push({ owner: `${org}/${projectName}`, name, fullName: `${org}/${projectName}/${name}`, url, private: isPrivate });
      }
    }
  }
  return { ok: true, repos };
}
