import type { ZodTypeAny } from 'zod';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import type { VaultChannel } from './manifest';

/**
 * The response schema of every channel the Vault reaches, keyed by channel —
 * what the no-value test walks. A channel added to `ipc` without a row here
 * fails `manifest.test.ts`, so a new reachable response cannot dodge the check.
 */
export const vaultResponseSchemas: Readonly<Record<VaultChannel, ZodTypeAny>> = {
  [CHANNELS.secretsHas]: schemas.SecretsHasResponse,
  [CHANNELS.secretsSet]: schemas.SecretsSetResponse,
  [CHANNELS.forgeAccounts]: schemas.ForgeAccountsResponse,
  [CHANNELS.forgeAccountAdd]: schemas.ForgeAccountAddResponse,
  [CHANNELS.forgeAccountRemove]: schemas.ForgeAccountRemoveResponse,
  [CHANNELS.dbListConnections]: schemas.DbListConnectionsResponse,
  [CHANNELS.dbDeleteConnection]: schemas.DbDeleteConnectionResponse,
  [CHANNELS.vaultGrantsList]: schemas.VaultGrantsListResponse,
  [CHANNELS.vaultGrantSet]: schemas.VaultGrantSetResponse,
  [CHANNELS.vaultGrantRevoke]: schemas.VaultGrantRevokeResponse,
  [CHANNELS.vaultPairingsList]: schemas.VaultPairingsListResponse,
  [CHANNELS.vaultPairingUnpair]: schemas.VaultPairingUnpairResponse,
  [CHANNELS.webAppsSignIns]: schemas.WebAppsSignInsResponse,
  [CHANNELS.webAppsSignOut]: schemas.WebAppsSignOutResponse,
  [CHANNELS.vaultLockStatus]: schemas.VaultLockStatusResponse,
  [CHANNELS.vaultLock]: schemas.VaultLockResponse,
  [CHANNELS.vaultUnlock]: schemas.VaultUnlockResponse,
  [CHANNELS.vaultAuditList]: schemas.VaultAuditListResponse,
  [CHANNELS.vaultAuditVerify]: schemas.VaultAuditVerifyResponse,
  [CHANNELS.vaultAuditExport]: schemas.VaultAuditExportResponse,
  [CHANNELS.vaultBreachCheck]: schemas.VaultBreachCheckResponse,
};
