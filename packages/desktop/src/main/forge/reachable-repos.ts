import type { ForgeAccount, ReachableRepo, ReachableReposResult } from '@midnite/studio-shared';

import { describeFailure, runInShell, shellQuote, LIST_TIMEOUT_MS } from './github/gh-shell';
import { parseJsonPayload } from './github/gh-parse';
import { glGet } from './gitlab/gitlab-client';

/**
 * "Repositories I can reach" — the repo picker's clone-or-open listing
 * (Phase 90 Theme C). A listing only: nothing here ever runs `git clone`
 * itself, matching Phase 49's settled posture that the app writes only what
 * the user pointed it at (`repo-handlers.ts`'s `repoClone` is the separate,
 * explicit write this listing feeds).
 *
 * **GitHub and GitLab today.** `capabilitiesFor(kind).repoListing` reports
 * `'full'` for both — GitLab's row as of Phase 90 Theme E, which is the
 * "next theme lands a real client" this module's own docblock anticipated.
 * Bitbucket and Azure DevOps still report `'none'`, and building a real
 * listing for either here would be building the adapter Themes F/G own, one
 * read early — `unsupported` stays the honest answer for them until then.
 */
export async function listReachableRepos(account: ForgeAccount): Promise<ReachableReposResult> {
  if (account.kind === 'github') return githubReachableRepos(account);
  if (account.kind === 'gitlab') return gitlabReachableRepos(account);
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
