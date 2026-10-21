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

import type { RuntimeIpc } from '@midnite/studio-runtime';

import { addForgeAccount, listForgeAccounts, removeForgeAccount, switchActiveForgeAccount } from '../forge-accounts';
import { switchGhAccount } from '../github/gh-shell';
import { listReachableRepos } from '../reachable-repos';

/**
 * Whether a switch to a `gh`-delegated GitHub account should also run `gh auth
 * switch` — Studio's `forge.syncGhAuthSwitch` setting (default on). A composer
 * with no such setting passes `() => true`.
 */
export type ForgeAccountPorts = { syncGhAuthSwitch: () => boolean };

/**
 * The account registry's IPC surface (Phase 90 Theme B) — repo-agnostic, so
 * every handler below ignores `resolveWorkdir`/`repoId` entirely, unlike
 * every handler in `forge-handlers.ts`.
 */
export function registerForgeAccountHandlers(ipc: RuntimeIpc, ports: ForgeAccountPorts): void {
  ipc.handle<typeof schemas.ForgeAccountsRequest, ForgeAccount[]>(
    CHANNELS.forgeAccounts,
    schemas.ForgeAccountsRequest,
    async () => listForgeAccounts(),
    () => [],
  );

  ipc.handle<typeof schemas.ForgeAccountAddRequest, ForgeAccountAddResult>(
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

  ipc.handle<typeof schemas.ForgeAccountRemoveRequest, { ok: boolean }>(
    CHANNELS.forgeAccountRemove,
    schemas.ForgeAccountRemoveRequest,
    async (req) => ({ ok: await removeForgeAccount(req.id) }),
    () => ({ ok: false }),
  );

  ipc.handle<typeof schemas.ForgeAccountSwitchRequest, { ok: boolean; activeAccountId: string | null }>(
    CHANNELS.forgeAccountSwitch,
    schemas.ForgeAccountSwitchRequest,
    async (req) => {
      const result = await switchActiveForgeAccount(req.id);
      if (result.ok) void syncGhAuthOnSwitch(result.activeAccountId, ports);
      return result;
    },
    () => ({ ok: false, activeAccountId: null }),
  );

  ipc.handle<typeof schemas.ForgeCapabilitiesRequest, ForgeCapability>(
    CHANNELS.forgeCapabilities,
    schemas.ForgeCapabilitiesRequest,
    (req) => capabilitiesFor(req.kind),
    () => capabilitiesFor('unknown'),
  );

  ipc.handle<typeof schemas.ForgeAccountReachableReposRequest, ReachableReposResult>(
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
 * behind the composer's `syncGhAuthSwitch` port (Studio: `forge.syncGhAuthSwitch`,
 * default on, mirrored from the renderer).
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
async function syncGhAuthOnSwitch(activeAccountId: string | null, ports: ForgeAccountPorts): Promise<void> {
  if (activeAccountId === null || !ports.syncGhAuthSwitch()) return;
  const account = (await listForgeAccounts()).find((a) => a.id === activeAccountId);
  if (!account || account.kind !== 'github' || account.delegated !== 'gh') return;
  await switchGhAccount(account.host, account.login);
}
