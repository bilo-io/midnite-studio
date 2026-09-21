import {
  CHANNELS,
  capabilitiesFor,
  schemas,
  type ForgeAccount,
  type ForgeAccountAddResult,
  type ForgeCapability,
} from '@midnite/studio-shared';

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
    async (req) => addForgeAccount(req.kind, req.host, req.token),
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
    async (req) => switchActiveForgeAccount(req.id),
    () => ({ ok: false, activeAccountId: null }),
  );

  handle<typeof schemas.ForgeCapabilitiesRequest, ForgeCapability>(
    CHANNELS.forgeCapabilities,
    schemas.ForgeCapabilitiesRequest,
    (req) => capabilitiesFor(req.kind),
    () => capabilitiesFor('unknown'),
  );
}
