import {
  CHANNELS,
  capabilitiesFor,
  normalizeForgeAccountHost,
  schemas,
  type ForgeAccount,
  type ForgeAccountAddResult,
  type ForgeCapability,
  type ReachableReposResult,
} from '@midnite/studio-shared';

import { currentSettings } from '../settings-mirror';
import { switchGhAccount } from '../forge/github/gh-shell';
import { listReachableRepos } from '../forge/reachable-repos';
import {
  addForgeAccount,
  listForgeAccounts,
  removeForgeAccount,
  switchActiveForgeAccount,
} from '../forge/forge-accounts';
import { handle } from './handle';

/**
 * The account registry's IPC surface (Phase 90 Theme B) — repo-agnostic, so
 * every handler below ignores `resolveWorkdir`/`repoId` entirely, unlike
 * every handler in `forge-handlers.ts`.
 */
export function registerForgeAccountHandlers(): void {
  handle<typeof schemas.ForgeAccountsRequest, ForgeAccount[]>(
    CHANNELS.forgeAccounts,
    schemas.ForgeAccountsRequest,
    async () => listForgeAccounts(),
    () => [],
  );

  handle<typeof schemas.ForgeAccountAddRequest, ForgeAccountAddResult>(
    CHANNELS.forgeAccountAdd,
    schemas.ForgeAccountAddRequest,
    async (req) => {
      // The schema's `refine` already rejected anything `normalizeForgeAccountHost`
      // would reject, so this can never be null here — re-deriving the
      // canonical hostname (not `req.host` verbatim) is what keeps a
      // `https://gitlab.example.com` base URL and a bare `gitlab.example.com`
      // from registering as two different accounts.
      const host = normalizeForgeAccountHost(req.host) ?? req.host;
      return addForgeAccount(req.kind, host, req.token);
    },
    (issue) => ({ ok: false, error: issue }),
  );

  handle<typeof schemas.ForgeAccountRemoveRequest, { ok: boolean }>(
    CHANNELS.forgeAccountRemove,
    schemas.ForgeAccountRemoveRequest,
    async (req) => ({ ok: await removeForgeAccount(req.id) }),
    () => ({ ok: false }),
  );

  handle<typeof schemas.ForgeAccountSwitchRequest, { ok: boolean; activeAccountId: string | null }>(
    CHANNELS.forgeAccountSwitch,
    schemas.ForgeAccountSwitchRequest,
    async (req) => {
      const result = await switchActiveForgeAccount(req.id);
      if (result.ok) void syncGhAuthOnSwitch(result.activeAccountId);
      return result;
    },
    () => ({ ok: false, activeAccountId: null }),
  );

  handle<typeof schemas.ForgeCapabilitiesRequest, ForgeCapability>(
    CHANNELS.forgeCapabilities,
    schemas.ForgeCapabilitiesRequest,
    (req) => capabilitiesFor(req.kind),
    () => capabilitiesFor('unknown'),
  );

  handle<typeof schemas.ForgeAccountReachableReposRequest, ReachableReposResult>(
    CHANNELS.forgeAccountReachableRepos,
    schemas.ForgeAccountReachableReposRequest,
    async (req) => {
      const account = (await listForgeAccounts()).find((a) => a.id === req.accountId);
      if (!account) return { ok: false, reason: 'no-account' };
      return listReachableRepos(account);
    },
    () => ({ ok: false, reason: 'error', message: 'Malformed request.' }),
  );
}

/**
 * Phase 90 Theme C: `gh auth switch` on a switch TO a GitHub account, gated
 * behind `forge.syncGhAuthSwitch` (default on, mirrored from the renderer —
 * see `settings-mirror.ts`).
 *
 * Fire-and-forget from the handler's point of view — the IPC response
 * already answered with the new `activeAccountId` before this runs, because
 * a shell spawn is not something a UI click should block on, and a failure
 * here has nowhere better to report than the same place every other
 * `gh`-shape failure already does: the next listing's own `cli.reason`.
 *
 * Only `delegated: 'gh'` accounts qualify. A second GitHub identity added
 * via a pasted PAT (`delegated: null`) was never one of `gh`'s own
 * logged-in users, so asking `gh auth switch --user <login>` to find it
 * would just fail — see `gh-shell.ts`'s own docblock on `switchGhAccount`.
 */
async function syncGhAuthOnSwitch(activeAccountId: string | null): Promise<void> {
  // `!== false` rather than a truthy check: the field is optional on the
  // wire precisely so an older payload that never set it still means "on",
  // matching the default everywhere else it is declared.
  if (activeAccountId === null || currentSettings().forgeSyncGhAuthSwitch === false) return;
  const account = (await listForgeAccounts()).find((a) => a.id === activeAccountId);
  if (!account || account.kind !== 'github' || account.delegated !== 'gh') return;
  await switchGhAccount(account.host, account.login);
}
