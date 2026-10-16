import { defineFeatureMain, registerVaultGrantHandlers, type VaultClient, type VaultGrants } from '@midnite/studio-runtime';
import {
  CHANNELS,
  SupportedForgeKindSchema,
  schemas,
  type ConnectionConfig,
  type DbOpResult,
  type ForgeAccount,
  type ForgeAccountAddResult,
} from '@midnite/studio-shared';

import { vaultManifest } from '../manifest';

export { vaultManifest, type VaultManifest } from '../manifest';
export { vaultResponseSchemas } from '../response-schemas';

/**
 * The vault feature's main half (Phase 113 Theme J) — the handlers a
 * standalone Vault app registers over the runtime's one vault service.
 *
 * **No handler here returns a stored value.** Nothing calls `vault.get`: a
 * secret answers `has` (a boolean), a forge account is derived from the entry
 * *names* (`vault.keys`) and answers `hasToken`, and a write is one-way. The
 * channel list is the manifest's, which does not contain `secretsGet`.
 *
 * Studio does not register this module: its own handlers (`desktop/.../ipc`)
 * already answer these channels over the same vault.
 */
export type VaultMainServices = {
  /** The Vault's own handle on the runtime vault (`service.forApp('vault')`). */
  vault: VaultClient;
  /**
   * Validates a token against its provider and stores it. Absent in a
   * standalone Vault, which does not carry the forge feature: adding then
   * answers an honest error instead of storing an unchecked token.
   */
  addForgeAccount?: (kind: string, host: string, token: string | undefined) => Promise<ForgeAccountAddResult>;
  /** The runtime's per-app grants (`createVaultGrants`) — the same store the vault service authorizes with. */
  grants: VaultGrants;
  /** Saved connections' non-secret metadata. Absent, there is none to list. */
  listConnections?: () => Promise<ConnectionConfig[]>;
};

const NO_ADD =
  'Adding an account needs the forge feature, which the standalone Vault does not carry yet — add it in Midnite Studio.';

/** `forgeAccountId`'s inverse: `kind:host:login` (a host has no colon). Unparseable names are skipped. */
export function accountFromKey(key: string): ForgeAccount | null {
  const first = key.indexOf(':');
  const second = key.indexOf(':', first + 1);
  if (first < 1 || second < 0) return null;
  const kind = SupportedForgeKindSchema.safeParse(key.slice(0, first));
  const host = key.slice(first + 1, second);
  const login = key.slice(second + 1);
  if (!kind.success || !host || !login) return null;
  return {
    id: key,
    kind: kind.data,
    host,
    login,
    displayName: login,
    avatarUrl: null,
    addedAt: 0,
    hasToken: true,
    delegated: null,
  };
}

export const vaultMain = defineFeatureMain<VaultMainServices>({
  feature: vaultManifest.feature,
  channels: vaultManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    const { vault } = services;

    ipc.handle(
      CHANNELS.secretsHas,
      schemas.SecretsHasRequest,
      async ({ key }) => ({ hasKey: await vault.has('secrets', key) }),
      () => ({ hasKey: false }),
    );
    ipc.handle(
      CHANNELS.secretsSet,
      schemas.SecretsSetRequest,
      async ({ key, value }) => {
        // An empty value clears the entry — the `secretsSet` contract.
        if (!value.trim()) await vault.delete('secrets', key);
        else await vault.set('secrets', key, value);
      },
      () => undefined,
    );

    ipc.handle(
      CHANNELS.forgeAccounts,
      schemas.ForgeAccountsRequest,
      async () => (await vault.keys('forge-accounts')).map(accountFromKey).filter((a): a is ForgeAccount => a !== null),
      () => [],
    );
    ipc.handle(
      CHANNELS.forgeAccountAdd,
      schemas.ForgeAccountAddRequest,
      async (req): Promise<ForgeAccountAddResult> =>
        services.addForgeAccount ? services.addForgeAccount(req.kind, req.host, req.token) : { ok: false, error: NO_ADD },
      (issue): ForgeAccountAddResult => ({ ok: false, error: issue }),
    );
    ipc.handle(
      CHANNELS.forgeAccountRemove,
      schemas.ForgeAccountRemoveRequest,
      async ({ id }) => {
        await vault.delete('forge-accounts', id);
        return { ok: true };
      },
      () => ({ ok: false }),
    );

    registerVaultGrantHandlers(ipc, () => services.grants);

    ipc.handleBare(CHANNELS.dbListConnections, async () => (await services.listConnections?.()) ?? []);
    ipc.handle(
      CHANNELS.dbDeleteConnection,
      schemas.DbDeleteConnectionRequest,
      async ({ id }): Promise<DbOpResult> => {
        await vault.delete('db-credentials', id);
        return { ok: true };
      },
      (issue): DbOpResult => ({ ok: false, kind: 'error', message: issue }),
    );
  },
});
