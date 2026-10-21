import {
  defineFeatureMain,
  registerVaultGrantHandlers,
  registerVaultPairingHandlers,
  type VaultClient,
  type VaultGrantsEditor,
  type VaultPairingsEditor,
} from '@midnite/studio-runtime';
import {
  CHANNELS,
  forgeAccountFromVaultKey,
  schemas,
  type ConnectionConfig,
  type DbOpResult,
  type ForgeAccount,
  type ForgeAccountAddResult,
  type WebAppId,
} from '@midnite/studio-shared';
import type { z } from 'zod';

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
  /**
   * The runtime's per-app grants — the store the vault authorizes with: in-process in Studio
   * (`createVaultGrants`), the runtime host's over its socket in the standalone Vault.
   */
  grants: VaultGrantsEditor;
  /** The host's guest pairings (list, Unpair). Absent: no app has paired, and Unpair does nothing. */
  pairings?: VaultPairingsEditor;
  /** Saved connections' non-secret metadata. Absent, there is none to list. */
  listConnections?: () => Promise<ConnectionConfig[]>;
  /**
   * The web apps' partitions (slice 3). Absent in the standalone Vault, which runs under its own
   * userData and so cannot see the `persist:app-<id>` sessions Studio's web apps signed in with:
   * the listing then answers unavailable, with {@link NEEDS_STUDIO_SIGN_INS} as the reason, and
   * Sign out refuses — the forge-add precedent, rather than reaching into another process.
   */
  webAppSignIns?: {
    list: () => Promise<WebAppsSignInsResponse>;
    signOut: (id: WebAppId) => Promise<WebAppsSignOutResponse>;
  };
};

type WebAppsSignInsResponse = z.infer<typeof schemas.WebAppsSignInsResponse>;
type WebAppsSignOutResponse = z.infer<typeof schemas.WebAppsSignOutResponse>;

/** Why the standalone Vault lists no web-app sign-ins. */
export const NEEDS_STUDIO_SIGN_INS =
  'Web-app sign-ins live in Midnite Studio’s own browser sessions, which the standalone Vault cannot see — open the Vault view in Midnite Studio to list or clear them.';

const NO_ADD =
  'Adding an account needs the forge feature, which the standalone Vault does not carry yet — add it in Midnite Studio.';

/** `forgeAccountId`'s inverse (`shared`'s `forgeAccountFromVaultKey`). Unparseable names are skipped. */
export const accountFromKey: (key: string) => ForgeAccount | null = forgeAccountFromVaultKey;

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
        // An empty value clears the entry — the `secretsSet` contract. A refused write (no runtime
        // host running, for the standalone Vault) reads back as unset rather than throwing over IPC.
        try {
          if (!value.trim()) await vault.delete('secrets', key);
          else await vault.set('secrets', key, value);
        } catch {
          // `secretsHas` answers the truth on the next read.
        }
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
        try {
          await vault.delete('forge-accounts', id);
          return { ok: true };
        } catch {
          return { ok: false };
        }
      },
      () => ({ ok: false }),
    );

    registerVaultGrantHandlers(ipc, () => services.grants);
    registerVaultPairingHandlers(ipc, () => services.pairings ?? null);

    ipc.handle(
      CHANNELS.webAppsSignIns,
      schemas.WebAppsSignInsRequest,
      async (): Promise<WebAppsSignInsResponse> =>
        services.webAppSignIns ? services.webAppSignIns.list() : { available: false, reason: NEEDS_STUDIO_SIGN_INS, apps: [] },
      (issue): WebAppsSignInsResponse => ({ available: false, reason: issue, apps: [] }),
    );
    ipc.handle(
      CHANNELS.webAppsSignOut,
      schemas.WebAppsSignOutRequest,
      async ({ id }): Promise<WebAppsSignOutResponse> =>
        services.webAppSignIns ? services.webAppSignIns.signOut(id) : { ok: false, message: NEEDS_STUDIO_SIGN_INS },
      (issue): WebAppsSignOutResponse => ({ ok: false, message: issue }),
    );

    ipc.handleBare(CHANNELS.dbListConnections, async () => (await services.listConnections?.()) ?? []);
    ipc.handle(
      CHANNELS.dbDeleteConnection,
      schemas.DbDeleteConnectionRequest,
      async ({ id }): Promise<DbOpResult> => {
        try {
          await vault.delete('db-credentials', id);
          return { ok: true };
        } catch (error) {
          return { ok: false, kind: 'error', message: error instanceof Error ? error.message : String(error) };
        }
      },
      (issue): DbOpResult => ({ ok: false, kind: 'error', message: issue }),
    );
  },
});
