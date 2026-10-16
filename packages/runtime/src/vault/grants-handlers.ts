import { CHANNELS, schemas } from '@midnite/studio-shared';

import type { FeatureMainContext } from '../feature-main';
import type { VaultGrants } from './grants';

/**
 * The three grant channels over a grants store — names only, never a value.
 *
 * Lives in the runtime rather than the vault feature because two hosts register it: the Vault app
 * (through `vaultMain`) and Studio, which does not register `vaultMain` (its own handlers answer the
 * secret channels) but must still let its Vault view edit grants. `vault` and `studio` are not valid
 * grantees — the request schema rejects them and the handler answers `{ ok: false }`.
 */
export function registerVaultGrantHandlers(ipc: FeatureMainContext['ipc'], grants: () => VaultGrants | null): void {
  ipc.handle(
    CHANNELS.vaultGrantsList,
    schemas.VaultGrantsListRequest,
    async () => grants()?.list() ?? { grants: {}, corrupt: false },
    () => ({ grants: {}, corrupt: false }),
  );
  ipc.handle(
    CHANNELS.vaultGrantSet,
    schemas.VaultGrantSetRequest,
    async ({ appId, namespace, scope }) => ({ ok: grants()?.set(appId, namespace, scope) ?? false }),
    () => ({ ok: false }),
  );
  ipc.handle(
    CHANNELS.vaultGrantRevoke,
    schemas.VaultGrantRevokeRequest,
    async ({ appId, namespace }) => ({ ok: grants()?.revoke(appId, namespace) ?? false }),
    () => ({ ok: false }),
  );
}
