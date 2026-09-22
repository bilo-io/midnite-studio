import type { ForgeAccount, ReachableRepo, ReachableReposResult } from '@midnite/studio-shared';

import { describeFailure, runInShell, shellQuote, LIST_TIMEOUT_MS } from './github/gh-shell';
import { parseJsonPayload } from './github/gh-parse';

/**
 * "Repositories I can reach" — the repo picker's clone-or-open listing
 * (Phase 90 Theme C). A listing only: nothing here ever runs `git clone`
 * itself, matching Phase 49's settled posture that the app writes only what
 * the user pointed it at (`repo-handlers.ts`'s `repoClone` is the separate,
 * explicit write this listing feeds).
 *
 * **GitHub only, deliberately.** `capabilitiesFor(kind).repoListing` already
 * reports `'none'` for GitLab, Bitbucket and Azure DevOps — Theme B shipped
 * accounts, not adapters, and building a real listing for the other three
 * kinds here would be building the adapter Themes E-G own, one read early.
 * `unsupported` is the honest answer until one of those lands a real client.
 */
export async function listReachableRepos(account: ForgeAccount): Promise<ReachableReposResult> {
  if (account.kind !== 'github') {
    return { ok: false, reason: 'unsupported' };
  }
  return githubReachableRepos(account);
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
