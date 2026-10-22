import { CHANNELS, schemas } from '@midnite/studio-shared';

import type { FeatureMainContext } from '../feature-main';
import type { VaultGrantsEditor } from './grants';
import type { PairingsListing } from './host/pairing-store';

/** The pairing store in-process (Studio's `PairingStore`) or the host's over its socket (`RemoteVault.pairing`). */
export interface VaultPairingsEditor {
  list(): PairingsListing | Promise<PairingsListing>;
  unpair(appId: string): boolean | Promise<boolean>;
}

/**
 * The two pairing channels (docs/APPS.md, "Pairing"): who has paired, any conflict, and Unpair — the
 * only way an app re-pairs. Registered by the same two hosts as the grants. Never a key.
 */
export function registerVaultPairingHandlers(
  ipc: FeatureMainContext['ipc'],
  pairings: () => VaultPairingsEditor | null,
  reauthCheck?: () => boolean,
): void {
  ipc.handle(
    CHANNELS.vaultPairingsList,
    schemas.VaultPairingsListRequest,
    async () => {
      // Only the wire's fields (no key) and only known apps ever leave main.
      const parsed = schemas.VaultPairingsListResponse.safeParse((await pairings()?.list()) ?? { apps: [] });
      return parsed.success ? parsed.data : { apps: [] };
    },
    () => ({ apps: [] }),
  );
  ipc.handle(
    CHANNELS.vaultPairingUnpair,
    schemas.VaultPairingUnpairRequest,
    async ({ appId }) => {
      if (reauthCheck && !reauthCheck()) return { ok: false };
      return { ok: (await pairings()?.unpair(appId)) ?? false };
    },
    () => ({ ok: false }),
  );
}

/**
 * The three grant channels over a grants store — names only, never a value.
 *
 * Lives in the runtime rather than the vault feature because two hosts register it: the Vault app
 * (through `vaultMain`) and Studio, which does not register `vaultMain` (its own handlers answer the
 * secret channels) but must still let its Vault view edit grants. `vault` and `studio` are not valid
 * grantees — the request schema rejects them and the handler answers `{ ok: false }`.
 */
export function registerVaultGrantHandlers(
  ipc: FeatureMainContext['ipc'],
  grants: () => VaultGrantsEditor | null,
  reauthCheck?: () => boolean,
): void {
  ipc.handle(
    CHANNELS.vaultGrantsList,
    schemas.VaultGrantsListRequest,
    async () => (await grants()?.list()) ?? { grants: {}, corrupt: false },
    () => ({ grants: {}, corrupt: false }),
  );
  ipc.handle(
    CHANNELS.vaultGrantSet,
    schemas.VaultGrantSetRequest,
    async ({ appId, namespace, scope }) => {
      if (reauthCheck && !reauthCheck()) return { ok: false };
      return { ok: (await grants()?.set(appId, namespace, scope)) ?? false };
    },
    () => ({ ok: false }),
  );
  ipc.handle(
    CHANNELS.vaultGrantRevoke,
    schemas.VaultGrantRevokeRequest,
    async ({ appId, namespace }) => {
      if (reauthCheck && !reauthCheck()) return { ok: false };
      return { ok: (await grants()?.revoke(appId, namespace)) ?? false };
    },
    () => ({ ok: false }),
  );
}
