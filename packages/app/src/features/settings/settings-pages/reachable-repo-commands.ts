import type { ForgeAccount, ReachableRepo } from '@midnite/studio-shared';

/**
 * Pure helpers behind the Reachable repositories row's trailing actions —
 * "open on the forge" and "delete via the provider's CLI". Kept apart from the
 * component so every provider's command shape is a plain unit test.
 */

/** The repo's page in a browser: the provider's own `webUrl` when the listing
 *  carried one, else built from the account host and `fullName`. */
export function reachableRepoWebUrl(account: ForgeAccount, repo: ReachableRepo): string {
  if (repo.webUrl) return repo.webUrl;
  if (account.kind === 'azure') {
    const { org, project } = splitAzureOwner(repo.owner);
    return `https://${account.host}/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo.name)}`;
  }
  return `https://${account.host}/${repo.fullName}`;
}

export type DeleteCommand =
  | { ok: true; command: string }
  | { ok: false; reason: string };

/**
 * The provider's own delete command for `repo`, to be typed at a shell prompt
 * and NOT run. Never carries a skip-confirmation flag (`--yes`): the CLI's own
 * "type the name to confirm" prompt is the safety, on top of the user having
 * to press Return at all.
 *
 * Never carries a credential either — a vault token (`forge-account-vault.ts`)
 * must not be echoed into a terminal's scrollback. So a token-backed account's
 * command runs as whatever that CLI is itself signed in as; a `gh`-delegated account pins the exact `gh` login it came from.
 */
export function reachableRepoDeleteCommand(account: ForgeAccount, repo: ReachableRepo): DeleteCommand {
  switch (account.kind) {
    case 'github': {
      const env: string[] = [];
      if (account.host !== 'github.com') env.push(`GH_HOST=${shellQuote(account.host)}`);
      if (account.delegated === 'gh') {
        // `gh auth token --user` reads one of gh's own stored logins without
        // switching gh's active account — so this targets the account the row
        // belongs to even when another gh login is active.
        env.push(
          `GH_TOKEN="$(gh auth token --hostname ${shellQuote(account.host)} --user ${shellQuote(account.login)})"`,
        );
      }
      return {
        ok: true,
        command: [...env, 'gh repo delete', shellQuote(repo.fullName)].join(' '),
      };
    }
    case 'gitlab': {
      const env = account.host === 'gitlab.com' ? [] : [`GITLAB_HOST=${shellQuote(account.host)}`];
      return {
        ok: true,
        command: [...env, 'glab repo delete', shellQuote(repo.fullName)].join(' '),
      };
    }
    case 'azure': {
      if (!repo.id) {
        return { ok: false, reason: "Azure DevOps didn't report this repository's id, which az repos delete needs" };
      }
      const { org, project } = splitAzureOwner(repo.owner);
      return {
        ok: true,
        command: [
          'az repos delete --id',
          shellQuote(repo.id),
          '--org',
          shellQuote(`https://${account.host}/${org}`),
          '--project',
          shellQuote(project),
        ].join(' '),
      };
    }
    case 'bitbucket':
      return { ok: false, reason: 'Bitbucket has no official CLI to delete a repository with' };
    default:
      return { ok: false, reason: 'No delete command for this provider' };
  }
}

/** Azure's `owner` is `{org}/{project}`; a project name cannot contain `/`. */
function splitAzureOwner(owner: string): { org: string; project: string } {
  const slash = owner.indexOf('/');
  return slash < 0 ? { org: owner, project: '' } : { org: owner.slice(0, slash), project: owner.slice(slash + 1) };
}

/** One shell word, whatever is in it — the same quoting `run-in-terminal.ts` uses. */
function shellQuote(text: string): string {
  return /^[A-Za-z0-9_.:@/-]+$/.test(text) ? text : `'${text.replace(/'/g, String.raw`'\''`)}'`;
}
